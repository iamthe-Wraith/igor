export default class FatalError extends Error {
  constructor (msg) {
    super(msg);
    this.isFatal = true;
  }
}
