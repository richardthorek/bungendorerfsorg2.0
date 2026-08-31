const { respond } = require("../shared/functionAdapter");
const { handleDutyLookup, handleDutyStatus, handleDutySet } = require("../shared/handlers");

module.exports = async function (context, req) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const action = context.bindingData && context.bindingData.action;

    let result;
    if (method === "GET" && action === "status") {
      result = await handleDutyStatus(req, process.env);
    } else if (method === "GET") {
      result = await handleDutyLookup(req, process.env);
    } else if (method === "POST" && !action) {
      result = await handleDutySet(req, process.env);
    } else {
      result = { status: 404, body: { error: "Not found" } };
    }
    respond(context, result);
  } catch (err) {
    context.log.error("duty function failed:", err);
    respond(context, { status: 500, body: { error: "Something went wrong." } });
  }
};
