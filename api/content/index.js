const { respond } = require("../shared/functionAdapter");
const { handleContentGet, handleContentSet } = require("../shared/handlers");

module.exports = async function (context, req) {
  try {
    const key = context.bindingData && context.bindingData.key;
    const method = (req.method || "GET").toUpperCase();
    const result =
      method === "PUT"
        ? await handleContentSet(key, req, process.env)
        : await handleContentGet(key, process.env);
    respond(context, result);
  } catch (err) {
    context.log.error("content function failed:", err);
    respond(context, { status: 500, body: { error: "Something went wrong." } });
  }
};
