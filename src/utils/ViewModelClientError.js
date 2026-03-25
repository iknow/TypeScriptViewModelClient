class ViewModelClientError extends Error {
  name = 'ViewModelClientError';

  constructor(message) {
    super(message);
    this.message = message;
  }
}

export default ViewModelClientError;
