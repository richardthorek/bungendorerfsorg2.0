const { functionFor } = require("../shared/functionAdapter");
const { handleAuthMe } = require("../shared/handlers");

module.exports = functionFor(handleAuthMe);
