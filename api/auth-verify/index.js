const { functionFor } = require("../shared/functionAdapter");
const { handleAuthVerify } = require("../shared/handlers");

module.exports = functionFor(handleAuthVerify);
