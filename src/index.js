const core = require('@actions/core');
const axios = require('axios');
const jobProcessors = require('./jobprocessors/processors');
const {context} = require("@actions/github");


let notCare = getStarted();
async function getStarted() {
    let failed = false;
    try {
        const spaceId = `600095`;
        const projectId = `19500036`;
        // 从参数获取branch和codeRepo
        const branchName = process.env.GITHUB_HEAD_REF;
        const branch = branchName.replace('refs/heads/','')
        const codeRepo = context.payload.pull_request.head.repo.ssh_url;
        const codeType = process.env.INPUT_SCAN_TYPE;
        const tips = core.getInput('tips', { required: true })
        // 许可证License,默认为Apache-2.0
        const license = core.getInput('license', { required: false }) || "Apache-2.0";
        core.debug("branch:" + branch);
        core.debug("codeRepo:" + codeRepo);
        core.debug("codeType:" + codeType);

        // 1. 获取token
        core.info("start...");

        // Set templateId based on codeType
        let templateId;
        let scaTaskId;
        if (codeType === "sca") {
            templateId = 20000430;
            // sca接入新API文档：https://yuque.antfin-inc.com/code-insight/odhoif/zppvg9?singleDoc#PXznu
            // sca扫描任务header
            // PRIVATE-TOKEN获取：https://antscaservice.alipay.com/profile
            const scaHeaders = {
                'PRIVATE-TOKEN': '29e2c23d-948a-4408-949d-37f633fbcd8e'
            };

            // 创建扫描任务
            const missionResponse = await axios.post('https://tantscaservice.run.alipay.net/v1/openapi/mission/create', {
                "userId":"2088612373631646",
                "branchName": branch,
                "repoUrl": codeRepo,
                "license": license,
                "scaTool": 0,
                "sourceSystem": "Openapi",
                "skipScan": true
            }, {
                headers: scaHeaders
            });
            core.debug("missionResponse: "+JSON.stringify(missionResponse));
            scaTaskId = missionResponse.data;
            // 3. 循环获取任务状态
            core.info("Scanning...");
            let status = "";
            const timeout = 20; // minute
            let isSuccess = false;
            for (let i = 0; i < timeout * 6; i++) {
                taskResponse = await axios.post("https://tantscaservice.run.alipay.net/v1/openapi/mission/get", {
                    "id": scaTaskId
                }, {
                    headers: scaHeaders
                });
                status = taskResponse.data.status;
                if (status === 3 || status === 4) {
                    break;
                }
                if (status === 8 || status ===9) {
                    isSuccess = true;
                    break;
                }
                await sleep(10);
            }
            if (isSuccess===false) {
                core.error("scan failed!");
                return;
            }
            core.info("Scan completed");

            const scaLink = `https://tantscaservice.run.alipay.net/dashboard/mission/${scaTaskId}`;
            core.warning(`详情请查看：${scaLink}` + "  " + tips);
            // 查询扫描出来的组件列表
            const componentResponse = await axios.post("https://tantscaservice.run.alipay.net/v1/openapi/component/list-with-file", {
                "missionId": scaTaskId
            }, {
                headers: scaHeaders
            });
            const componentList = componentResponse.data.data;
            const jobProcessor = jobProcessors["codescan-sca-new"];
            if (jobProcessor) {
                failed = jobProcessor(componentList) || failed;
            }

        } else if (codeType === "stc") {
            templateId = 20000425;
            const tokenResponse = await axios.post('https://tcloudrunconsole.openapi.cloudrun.cloudbaseapp.cn/v2/login/serviceaccount', {
                "parent_uid": core.getInput('parent_uid', { required: true }),
                "private_key": core.getInput('private_key', { required: true }),
            });
            const token = tokenResponse.data.data.access_token;

            // 设置请求头
            const headers = {
                'Authorization': `Bearer ${token}`,
                'x-node-id': core.getInput('parent_uid', { required: true }),
                'Content-Type': 'application/json'
            };
            // 2. 调用代码检查
            const pipelineExecuteResponse = await axios.post(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/execute`, {
                "templateId": templateId,
                "branch": branch,
                "codeRepo": codeRepo
            }, {
                headers: headers
            });
            core.debug("pipelineExecuteResponse: "+JSON.stringify(pipelineExecuteResponse.data));
            const recordId = pipelineExecuteResponse.data.result.recordId;
            // 3. 循环获取recordInfo
            core.info("Scanning...");
            let status = "";
            const timeout = 20; // minute
            let recordResponse;
            for (let i = 0; i < timeout * 6; i++) {
                recordResponse = await axios.get(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/${recordId}`, {
                    headers: headers
                });
                status = recordResponse.data.result.status;
                if (status === "FINISHED") {
                    break;
                }
                await sleep(10);
            }
            core.info("Scan completed");

            // 获取失败的job, 获取失败信息
            core.debug("recordResponse.data: " + JSON.stringify(recordResponse.data))
            const recordResult = recordResponse.data.result;
            const allJobs = recordResult.stageExecutions.flatMap(stage => stage.jobExecutions);
            for (const failureJob of allJobs) {
                const jobId = failureJob.id;
                const jobResponse = await axios.get(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/${recordId}/job/${jobId}`, {
                    headers: headers
                });
                core.debug("jobResponse.data: " + JSON.stringify(jobResponse.data))
                const link = `https://devops.cloud.alipay.com/project/${projectId}/${recordId}/pipeline/details`;
                core.warning(`详情请查看：${link}` + "  " + tips);
                const jobDetail = jobResponse.data.result.data;
                const jobProcessor = jobProcessors[failureJob.componentName];
                if (jobProcessor) {
                    failed = jobProcessor(jobDetail) || failed;
                }
            }
        } else {
            core.error("错误：无效的codeType");
            return;
        }
    } catch (error) {
        core.setFailed(error.message);
    }
    core.setOutput("result", failed ? "FAILED" : "PASSED");
}

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
module.exports = getStarted;