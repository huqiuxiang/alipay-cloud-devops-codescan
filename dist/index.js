module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete installedModules[moduleId];
/******/ 		}
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(560);
/******/ 	};
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 131:
/***/ (function(module, __unusedexports, __webpack_require__) {

const core = __webpack_require__(978);

/**
 * 处理开源合规的扫描结果 返回ture表示有报错
 * 警告:
 *   1. 代码相似度过高
 * 报错:
 *   1. 存在licence冲突
 */
function process(jobDetail){
    core.debug("jobDetail.artifacts:"+jobDetail.artifacts)
    if (jobDetail.state !== "Success") {
        core.error("开源合规组件 执行失败 或 超时未完成!")
        return true
    }
    const artifacts = JSON.parse(jobDetail.artifacts);
    const licence = artifacts.license;
    let failed = false

    //licence冲突 报错
    const licenceText = JSON.parse(licence.text);
    if (licenceText.compatibility === false) {
        Object.entries(licenceText.conflictingLicense).forEach(([licenceName, component]) => {
            if (licenceName === "") {
                return;
            }
            const [componentName, version] = Object.entries(component)[0];
            // core.setFailed(`请注意, 项目依赖的 ${componentName}:${version} 组件,使用的licence可能与本项目冲突: ${licenceName}`)
            core.warning(`请注意, 项目依赖的 ${componentName}:${version} 组件,使用的licence可能与本项目冲突: ${licenceName}`)
            failed = true;
        });
    }
    //code相似 警告
    const code = artifacts.code;
    const codeText = JSON.parse(code.text);
    Object.entries(codeText).forEach(([fileName, conflictRepo]) => {
        core.warning(`请注意, 您的代码 ${fileName} 与 开源项目 ${conflictRepo[0].name}:${conflictRepo[0].version} 的文件: ${conflictRepo[0].downloadUrl} 相似度: ${conflictRepo[0].score}`)
    });
    return ! licenceText.compatibility;
}
module.exports = process;

/***/ }),

/***/ 183:
/***/ (function(module, __unusedexports, __webpack_require__) {

const core = __webpack_require__(978);

/**
 * 处理安全扫描里的安全风险 返回ture表示有报错
 * 报错:
 *   1. high/urgent 级别的安全隐患
 * 警告:
 *   1. low/medium/warn 级别的安全隐患
 */
function process(jobDetail){
    let hasError = false;
    [...JSON.parse(jobDetail.high), ...JSON.parse(jobDetail.urgent),...JSON.parse(jobDetail.low), ...JSON.parse(jobDetail.medium), ...JSON.parse(jobDetail.warn)].forEach(risk=>{
        let errorMessage = risk.title;
        if (risk.filePath) {
            errorMessage += `\n文件: ${risk.filePath}`
        }
        if (risk.description) {
            errorMessage += `\n细节/建议:\n${risk.description}`
        }
        if (['high','urgent'].includes(risk.rank)){
            hasError = true;
            core.setFailed(errorMessage);
        }else {
            core.warning(errorMessage);
        }
    });
    return hasError;
}
module.exports = process;

/***/ }),

/***/ 345:
/***/ (function(module) {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 560:
/***/ (function(module, __unusedexports, __webpack_require__) {

const core = __webpack_require__(978);
const axios = __webpack_require__(764);
const jobProcessors = __webpack_require__(574);
const {context} = __webpack_require__(345);


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
        core.debug("branch:" + branch);
        core.debug("codeRepo:" + codeRepo);
        core.debug("codeType:" + codeType);

        // 1. 获取token
        core.info("start...");
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

        // sca扫描任务header
        // PRIVATE-TOKEN获取：https://antscaservice.alipay.com/profile
        const scaHeaders = {
            'PRIVATE-TOKEN': '12847bb6-7e5a-40d5-8193-32cc7ef27f69'
        };
        // Set templateId based on codeType
        let templateId;
        let scaTaskId;
        if (codeType === "sca") {
            templateId = 20000430;
            // sca接入新API
            // 创建扫描任务
            const missionResponse = await axios.post('https://tantscaservice.run.alipay.net/v1/openapi/mission/create', {
                "userId":core.getInput('parent_uid', { required: true }),
                "branchName": branch,
                "repoUrl": codeRepo,
                "scaTool": 0,
                "sourceSystem": "Openapi",
                "skipScan": true
            }, {
                headers: scaHeaders
            });
            core.debug("missionResponse: "+JSON.stringify(missionResponse));
            scaTaskId = missionResponse.data;
        } else if (codeType === "stc") {
            templateId = 20000425;
        } else {
            core.error("错误：无效的codeType");
            return;
        }

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
            const scaLink = `https://tantscaservice.run.alipay.net/dashboard/mission/${scaTaskId}`;
            if (codeType === "sca") {
                core.warning(`详情请查看：${scaLink}` + "  " + tips);
            } else {
                core.warning(`详情请查看：${link}` + "  " + tips);
            }
            const jobDetail = jobResponse.data.result.data;
            const jobProcessor = jobProcessors[failureJob.componentName];
            if (jobProcessor) {
                failed = jobProcessor(jobDetail) || failed;
            }
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

/***/ }),

/***/ 574:
/***/ (function(module, __unusedexports, __webpack_require__) {

const stcProcessor = __webpack_require__(183)
const codescanScaProcessor = __webpack_require__(131)
const jobProcessors = {
    "stc": stcProcessor,
    "codescan-sca": codescanScaProcessor
}
module.exports = jobProcessors;

/***/ }),

/***/ 764:
/***/ (function(module) {

module.exports = eval("require")("axios");


/***/ }),

/***/ 978:
/***/ (function(module) {

module.exports = eval("require")("@actions/core");


/***/ })

/******/ });