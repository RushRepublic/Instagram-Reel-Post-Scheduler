/** Error carrying an HTTP status and a DRF-shaped JSON body. */
class ApiError extends Error {
  constructor(status, body) {
    super(typeof body?.detail === "string" ? body.detail : "API error");
    this.status = status;
    this.body = body;
  }
}
const notFound = () => new ApiError(404, { detail: "Not found." });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, notFound, wrap };
