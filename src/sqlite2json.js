const fs = require("fs-extra"),
  path = require("path"),
  { format, addSeconds } = require("date-fns"),
  _ = require("lodash"),
  sqlite3 = require("sqlite3"),
  DB_PATH = "./resources/runtastic/Container/Documents/database.sqlite3",
  db = new sqlite3.Database(path.resolve(DB_PATH)),
  OUTPUT_DIR = "./resources/json",
  SESSION_SQL =
    "select session_id, global_session_id, start_timestamp, end_timestamp, description from SESSION_DATA order by session_id",
  SQL = {
    GPS: (sessionId) =>
      `select session_id, unix_timestamp as timestamp, longitude, latitude, altitude from GPS_DATA where session_id = ${sessionId} order by session_id, unix_timestamp`,
    // SPEED: (sessionId) =>
    //   `select session_id, timestamp * 1000 as timestamp, speed from SPEED where session_id = ${sessionId} order by session_id, timestamp`,
    CADENCE: (sessionId) =>
      `select session_id, timestamp * 1000 as timestamp, cadence from CADENCE where session_id = ${sessionId} order by session_id, timestamp`,
    // HEARTRATE: (sessionId) =>
    //   `select session_id, timestamp * 1000 as timestamp, heartrate from HEARTRATE where session_id = ${sessionId} order by session_id, timestamp`,
  },
  // JSONの出力
  writeJson = (sessionId, file, items) => {
    const outputDirPath = path.join(OUTPUT_DIR, `session${sessionId}`),
      outputFilePath = path.join(outputDirPath, `${file}.json`);

    let data;
    if (_.isArray(items)) {
      const obj = items
        .sort((a, b) => a.timestamp - b.timestamp)
        .reduce((result, item) => {
          result[item.time] = item;
          return result;
        }, {});
      data = Object.keys(obj)
        .sort((a, b) => obj[a].timestamp - obj[b].timestamp)
        .map((key) => obj[key]);
      // fs.mkdirsSync(outputDirPath);
      // fs.writeFileSync(outputFilePath, JSON.stringify(data), {
      //   encoding: "utf-8",
      // });
    } else {
      data = items;
      fs.mkdirsSync(outputDirPath);
      fs.writeFileSync(outputFilePath, JSON.stringify(data), {
        encoding: "utf-8",
      });
    }

    console.info(outputFilePath);
    return data;
  },
  getTypePromise = (sessionId, file) =>
    new Promise((resolve) => {
      const rows = [];
      db.each(
        SQL[file](sessionId),
        (err, row) => {
          if (row.timestamp) {
            const date = new Date(row.timestamp);
            date.setMilliseconds(0);
            row.timestamp = date.getTime();
            row.time = format(row.timestamp, "yyyy-MM-dd'T'HH:mm:ss'Z'");
          }
          rows.push(row);
        },
        () => {
          resolve({ sessionId, file, rows: writeJson(sessionId, file, rows) });
        }
      );
    }),
  getNearlyTimeValue = (items, prop, timestamp) => {
    const index = _.findIndex(items, (v) => timestamp === v.timestamp);
    if (index > -1) {
      // 同じ時間のものがあった場合
      return items[index][prop];
    } else if (items.length) {
      // 同じ時間のものは無いがデータはある場合
      const timestampPrev = addSeconds(timestamp, -4),
        prevIndex = _.findLastIndex(
          items,
          (v) => timestampPrev <= v.timestamp && v.timestamp < timestamp
        );
      if (prevIndex > -1) {
        // 指定秒以内前のものがある場合はそれを使う
        return items[prevIndex][prop];
      }
      const timestampNext = addSeconds(timestamp, 4),
        nextIndex = _.findIndex(
          items,
          (v) => timestamp < v.timestamp && v.timestamp <= timestampNext
        );
      if (nextIndex > -1) {
        // 指定秒以内後のものがある場合はそれを使う
        return items[nextIndex][prop];
      }
    }
  },
  getSessionPromise = (sessionId) =>
    new Promise((resolve) => {
      const typePromises = [];
      for (const type of Object.keys(SQL)) {
        typePromises.push(getTypePromise(sessionId, type));
      }
      return Promise.all(typePromises)
        .then((data) => {
          // session毎に結果をマージする
          let sessionId, gpses, cadences, heartrates;
          // 各typeの結果をより分ける
          data.forEach((item) => {
            const file = item.file;
            if (file === "GPS") {
              sessionId = item.sessionId;
              gpses = item.rows;
            } else {
              if (file === "CADENCE") {
                cadences = item.rows;
              } else if (file === "HEARTRATE") {
                heartrates = item.rows;
              }

              // const timeMap = {};
              // item.rows.forEach((row) => {
              //   timeMap[row.time] = row;
              // });
              // if (file === "CADENCE") {
              //   cadences = timeMap;
              // } else if (file === "HEARTRATE") {
              //   heartrates = timeMap;
              // }
            }
          });
          // gpsへ他の情報を反映
          const result = gpses.map((gps, i) => {
            const timestamp = gps.timestamp;
            // ケイデンス
            const cadence = getNearlyTimeValue(cadences, "cadence", timestamp);
            if (cadence != null) {
              gps.cadence = cadence;
            }
            // 心拍数
            // const heartrate = getSameTimeValue(
            //   heartrates,
            //   "heartrate",
            //   timestamp
            // );
            // if (heartrate != null) {
            //   gps.heartrate = heartrate;
            // }
            return gps;
          });
          const outputDirPath = path.join(OUTPUT_DIR, `session${sessionId}`),
            outputFilePath = path.join(outputDirPath, `DATA.json`);
          fs.mkdirsSync(outputDirPath);
          fs.writeFileSync(outputFilePath, JSON.stringify(result), {
            encoding: "utf-8",
          });
          console.info(outputFilePath);
        })
        .then(() => resolve());
    });

fs.removeSync(OUTPUT_DIR);

const sessionIds = [];
new Promise((resolve) => {
  db.each(
    SESSION_SQL,
    (err, session) => {
      const sessionId = session.session_id;
      sessionIds.push(sessionId);
      session.start_time = format(
        session.start_timestamp,
        "yyyy-MM-dd'T'HH:mm:ss'Z'"
      );
      session.end_time = format(
        session.end_timestamp,
        "yyyy-MM-dd'T'HH:mm:ss'Z'"
      );
      writeJson(sessionId, "SESSION", session);
    },
    () => resolve()
  );
})
  .then(() => {
    const sessionPromises = [];
    for (const sessionId of sessionIds) {
      sessionPromises.push(getSessionPromise(sessionId));
    }
    return Promise.all(sessionPromises);
  })
  .then(() => {
    db.close();
    console.log("finish");
  });
