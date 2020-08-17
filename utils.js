/**
 * [userFilterMany 同时筛选data的多个value]
 * @param  {[type]}  param     [需要获取的参数]
 * @return {[type]}           [取得的参数的值]
 */
export function GetQueryString(param, url) {
  const reg = new RegExp("(^|&)" + param + "=([^&]*)(&|$)");
  let u = "";
  if (url) {
    u = "?" + url.split("?")[1];
  } else {
    u = window.location.search;
  }
  const r = u.substr(1).match(reg);
  if (r != null) return decodeURI(r[2]);
  return null;
}
