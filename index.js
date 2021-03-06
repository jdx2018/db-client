import io from "socket.io-client";
import crypto from "crypto";
import cache from "./cache";
import { GetQueryString } from "./utils";

const options = {};
options.transports = ["polling"];
options.transports = ["websocket"];

const channel = {
  login_pc: {
    request: "api/pc/login/request",
    response: "api/pc/login/response",
  },
  getConnection: {
    request: "db/getConnection/request",
    response: "db/getConnection/response",
  },
  beginTrans: {
    request: "db/beginTrans/request",
    response: "db/beginTrans/response",
  },
  commitTrans: {
    request: "db/commitTrans/request",
    response: "db/commitTrans/response",
  },
  rollbackTrans: {
    request: "db/rollbackTrans/request",
    response: "db/rollbackTrans/response",
  },
  executeObjWithCon: {
    request: "db/executeObjWithCon/request",
    response: "db/executeObjWithCon/response",
  },
  executeSqlWithCon: {
    request: "db/executeSqlWithCon/request",
    response: "db/executeSqlWithCon/response",
  },
  login_sso: {
    request: "api/sso/login/request",
    response: "api/sso/login/response",
  },
  sendSms: { request: "sms/send/request", response: "sms/send/response" },
  sendEmail: { request: "email/send/request", response: "email/send/response" },
};
Date.prototype.Format = function (format) {
  var date = {
    "M+": this.getMonth() + 1,
    "d+": this.getDate(),
    "h+": this.getHours(),
    "m+": this.getMinutes(),
    "s+": this.getSeconds(),
    "q+": Math.floor((this.getMonth() + 3) / 3),
    "S+": this.getMilliseconds(),
  };
  if (/(y+)/i.test(format)) {
    format = format.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
  }
  for (var k in date) {
    if (new RegExp("(" + k + ")").test(format)) {
      format = format.replace(
        RegExp.$1,
        RegExp.$1.length === 1 ? date[k] : ("00" + date[k]).substr(("" + date[k]).length)
      );
    }
  }
  return format;
};

const sign = {
  aes_encrypt: function aes_encrypt(key, iv, rawData) {
    key = Buffer.alloc(16, key, "utf-8");
    iv = Buffer.alloc(16, iv, "utf-8");
    let cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    cipher.setAutoPadding(true);
    let encoded = cipher.update(rawData, "utf-8", "base64");
    encoded += cipher.final("base64");
    return encoded;
  },
  md5: (str) => {
    let cryptor = crypto.createHash("md5");
    return cryptor.update(str).digest("hex");
  },
  encrypt: function encrypt(rawData) {
    console.log(
      "%c%s",
      "color: red; background: yellow; font-size: 24px;",
      "JSON.stringify(rawData): ",
      JSON.stringify(rawData)
    );
    // console.log(JSON.stringify(rawData));
    let encryptData = this.aes_encrypt(
      dbClient.getConfig("sign_params").key,
      dbClient.getConfig("sign_params").iv,
      JSON.stringify(rawData)
    );

    return this.md5(encryptData + dbClient.getConfig("sign_params").salt + new Date().Format("YYYY-MM-dd"));
  },
};

const operateEnum = {
  query: "query",
  insert: "insert",
  update: "update",
  delete: "delete",
  insertMany: "insertMany",
};
var dbClient = {
  args: {},
  verifyOpts: function verifyOpts(option) {
    const requiredOpts = ["end_point", "sign_params"];
    requiredOpts.forEach((requiredKey) => {
      if (!option.hasOwnProperty(requiredKey)) {
        throw new Error(`Must contain Required params ${requiredKey}`);
      }
    });
    return true;
  },
  setConfig: function setConfig(option) {
    if (this.verifyOpts(option)) {
      this.args = option;
    }
  },
  getConfig: function getConfig(configName) {
    if (this.args[configName]) {
      return this.args[configName];
    }
    throw new Error("You should call setConfig before use dbClient!");
  },
  getSocket: async function getSocket() {
    return new Promise((resolve, reject) => {
      let socket = io(this.getConfig("end_point"), options);
      socket.on("connect", () => {
        resolve(socket);
      });
      socket.on("disconnect", () => {
        // console.log("disconnect");
      });
      // socket.on("connect_error", (err) => {
      //   reject(err);
      // });
    });
  },
  login: async function login(tenantId, userId, pwd) {
    return new Promise(async (resolve, reject) => {
      let socket = null;
      try {
        socket = await this.getSocket();
        let rawData = { tenantId, userId, pwd };

        let signature = sign.encrypt(rawData);

        let data = { signature: signature, body: rawData };

        socket.emit(channel.login_pc.request, JSON.stringify(data));
        socket.on(channel.login_pc.response, (res) => {
          res = JSON.parse(res);
          socket.close();
          if (res.code === 1) {
            cache.access_token_set(res.data.access_token);
            cache.userId_set(userId);
            resolve(res);
          } else {
            reject(res);
          }
        });
      } catch (err) {
        if (socket) {
          socket.close();
        }
        reject(err);
      }
    });
  },
  login_sso: async function login_sso(code) {
    return new Promise(async (resolve, reject) => {
      let socket = null;
      try {
        socket = await this.getSocket();
        let rawData = {
          code: code,
          url: GetQueryString("redirect_uri", this.getConfig("url")),
        };
        let signature = sign.encrypt(rawData);
        let data = { signature: signature, body: rawData };
        socket.emit(channel.login_sso.request, JSON.stringify(data));
        socket.on(channel.login_sso.response, (res) => {
          res = JSON.parse(res);
          socket.close();
          if (res.code === 1) {
            cache.access_token_set(res.data.access_token);
            cache.userId_set(res.data.user.userId);
            resolve(res);
          } else {
            reject(res);
          }
        });
      } catch (err) {
        if (socket) {
          socket.close();
        }
        reject(err);
      }
    });
  },
  getConnection: async function getConnection() {
    let socket = await this.getSocket();
    return new Promise((resolve, reject) => {
      let rawData = { id: socket.id };
      try {
        let signature = sign.encrypt(rawData);
        if (!cache.access_token_get() || !cache.userId_get()) {
          throw new Error("You should login first！");
        }
        let data = {
          signature: signature,
          access_token: cache.access_token_get(),
          userId: cache.userId_get(),
          body: rawData,
        };

        socket.emit(channel.getConnection.request, JSON.stringify(data));
        socket.on(channel.getConnection.response, (res) => {
          res = JSON.parse(res);
          if (res.code === 1) {
            resolve(socket);
          } else {
            this.Close(socket);
            reject(res);
          }
        });
      } catch (err) {
        this.Close(socket);
        reject(err);
      }
    });
  },
  executeChannel: async function executeChannel(con, channelObj, param) {
    return new Promise(async (resolve, reject) => {
      try {
        let needRelease = false;
        if (!con) {
          con = await this.getConnection();
          needRelease = true;
        }
        if (!param) {
          param = {};
        }
        param.id = con.id;
        let signature = sign.encrypt(param);
        let data = {
          signature: signature,
          access_token: cache.access_token_get(),
          userId: cache.userId_get(),
          body: param,
        };

        con.emit(channelObj.request, JSON.stringify(data));
        con.on(channelObj.response, (res) => {
          res = JSON.parse(res);
          if (needRelease) {
            con.close();
          }
          if (res.code === 1) {
            resolve(res);
          } else {
            reject(res);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  },
  executeObjWithCon: async function executeObjWithCon(
    con,
    operate,
    tableName,
    query,
    fields,
    dataContent,
    pageNum,
    pageSize
  ) {
    return this.executeChannel(con, channel.executeObjWithCon, {
      operate,
      tableName,
      query,
      fields,
      dataContent,
      pageNum,
      pageSize,
    });
  },
  executeSqlWithCon: async function executeSqlWithCon(con, sql, params) {
    return this.executeChannel(con, channel.executeSqlWithCon, { sql, params });
  },
  QueryWithCon: async function QueryWithCon(con, tableName, query, fields, pageNum, pageSize) {
    return this.executeObjWithCon(con, operateEnum.query, tableName, query, fields, null, pageNum, pageSize);
  },
  Query: async function Query(tableName, query, fields, pageNum, pageSize) {
    return this.QueryWithCon(null, tableName, query, fields, pageNum, pageSize);
  },
  UpdateWithCon: async function UpdateWithCon(con, tableName, query, dataContent) {
    return this.executeObjWithCon(con, operateEnum.update, tableName, query, null, dataContent);
  },
  Update: async function Update(tableName, query, dataContent) {
    return this.UpdateWithCon(null, tableName, query, dataContent);
  },
  InsertWithCon: async function InsertWithCon(con, tableName, dataContent) {
    return this.executeObjWithCon(con, operateEnum.insert, tableName, null, null, dataContent);
  },
  Insert: async function Insert(tableName, dataContent) {
    return this.InsertWithCon(null, tableName, dataContent);
  },
  InsertManyWithCon: async function InsertManyWithCon(con, tableName, dataContent) {
    return this.executeObjWithCon(con, operateEnum.insertMany, tableName, null, null, dataContent);
  },
  InsertMany: async function InsertMany(tableName, dataContent) {
    return this.InsertManyWithCon(null, tableName, dataContent);
  },
  DeleteWithCon: async function DeleteWithCon(con, tableName, query) {
    return this.executeObjWithCon(con, operateEnum.delete, tableName, query, null, null);
  },
  Delete: async function Delete(tableName, query) {
    return this.DeleteWithCon(null, tableName, query);
  },
  ExecuteTrans: async function ExecuteTrans(callback) {
    let con_temp = null;
    let res_temp = null;
    let isTrans = false;
    try {
      con_temp = await this.getConnection();
      await this.executeChannel(con_temp, channel.beginTrans);
      isTrans = true;
      res_temp = await callback(con_temp);
      await this.executeChannel(con_temp, channel.commitTrans);
      this.Close(con_temp);
      return res_temp;
    } catch (err) {
      if (isTrans) {
        console.log("client rollback");
        await this.executeChannel(con_temp, channel.rollbackTrans);
      }
      this.Close(con_temp);
      throw err;
    }
  },
  Close: function Close(con) {
    try {
      if (con) {
        con.close();
      }
    } catch (err) {
      console.log(err);
    }
  },
  SendSms: async function (mobile, content) {
    return await this.executeChannel(null, channel.sendSms, {
      mobile: mobile,
      content: content,
    });
  },
  SendEmail: async function (toAddr, ccAddress, title, content) {
    return await this.executeChannel(null, channel.sendEmail, {
      toAddr: toAddr,
      ccAddress: ccAddress,
      title: title,
      content: content,
    });
  },
};
export default dbClient;
