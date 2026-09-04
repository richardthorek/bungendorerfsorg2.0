const { functionFor } = require("../shared/functionAdapter");
const { handleClarityCron } = require("../shared/handlers");

module.exports = functionFor(handleClarityCron);
