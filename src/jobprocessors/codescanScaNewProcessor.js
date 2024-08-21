const core = require("@actions/core");

/**
 * 处理开源合规的扫描结果 返回ture表示有报错
 * 警告:
 *   1. 代码相似度过高
 * 报错:
 *   1. 存在licence冲突
 */
function process(componentList){
    core.debug("componentList:" + JSON.stringify(componentList));
    let failed = false;

    //licence冲突 报错
    componentList.forEach((component) => {
        const licenses =
            component.licenses.length === 0 ? "未录入" : component.licenses;
        core.warning(
            `请注意, 项目依赖的 ${component.name}:${component.version} 组件,使用的licence可能与本项目冲突: ${licenses}`,
        );
        failed = true;
    });

    //code相似 警告
    componentList.forEach((component) => {
        core.warning(
            `请注意, 您的代码 ${component.filePath} 与 开源项目 ${component.name}:${component.version} 的文件: ${component.componentFilePath} 相似度: ${component.score}`,
        );
    });
    return failed;
}
module.exports = process;