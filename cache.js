function access_token_get() {
  return localStorage.getItem("access_token");
}
function access_token_set(token) {
  localStorage.setItem("access_token", token);
}
function userId_get() {
  return localStorage.getItem("userId");
}
function userId_set(userId) {
  localStorage.setItem("userId", userId);
}
export default {
  access_token_get,
  access_token_set,
  userId_get,
  userId_set,
};
