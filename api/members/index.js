const { respond } = require("../shared/functionAdapter");
const {
  handleMembersList,
  handleMembersUpsert,
  handleMembersDelete,
} = require("../shared/handlers");

module.exports = async function (context, req) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const emailParam = context.bindingData && context.bindingData.email;

    let result;
    if (method === "GET") {
      result = await handleMembersList(req, process.env);
    } else if (method === "POST") {
      result = await handleMembersUpsert(req, process.env);
    } else if (method === "DELETE") {
      result = await handleMembersDelete(req, emailParam, process.env);
    } else {
      result = { status: 405, body: { error: "Method not allowed" } };
    }
    respond(context, result);
  } catch (err) {
    context.log.error("members function failed:", err);
    respond(context, { status: 500, body: { error: "Something went wrong. Try again." } });
  }
};
