const stcProcessor = require("./stcProcessor")
const codescanScaProcessor = require("./codescanScaProcessor")
const codescanScaNewProcessor = require("./codescanScaNewProcessor")
const jobProcessors = {
    "stc": stcProcessor,
    "codescan-sca": codescanScaProcessor,
    "codescan-sca-new":codescanScaNewProcessor
}
module.exports = jobProcessors;