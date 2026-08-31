const { functionFor } = require("../shared/functionAdapter");
const { handleAuthRequest } = require("../shared/handlers");

module.exports = functionFor(handleAuthRequest);
