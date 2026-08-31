const { functionFor } = require("../shared/functionAdapter");
const { handleAuthLogout } = require("../shared/handlers");

module.exports = functionFor(handleAuthLogout);
