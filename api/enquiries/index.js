const { respond } = require("../shared/functionAdapter");
const {
  handleEnquiriesList,
  handleEnquiryUpdate,
  handleEnquiryDelete,
} = require("../shared/handlers");

module.exports = async function (context, req) {
  try {
    const id = context.bindingData && context.bindingData.id;
    const method = (req.method || "GET").toUpperCase();
    let result;
    if (method === "GET") result = await handleEnquiriesList(req, process.env);
    else if (method === "PATCH" && id) result = await handleEnquiryUpdate(id, req, process.env);
    else if (method === "DELETE" && id) result = await handleEnquiryDelete(id, req, process.env);
    else result = { status: 404, body: { error: "Not found" } };
    respond(context, result);
  } catch (err) {
    context.log.error("enquiries function failed:", err);
    respond(context, { status: 500, body: { error: "Something went wrong." } });
  }
};
