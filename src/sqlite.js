const fs = require("fs-extra"),
  path = require("path"),
  { format } = require("date-fns"),
  _ = require("lodash"),
  sqlite3 = require("sqlite3"),
  dbDir = "./resources/runtastic/Container/Documents/database.sqlite3",
  db = new sqlite3.Database(path.resolve(dbDir), sqlite3.OPEN_READONLY),
  outputDir = "./resources/json",
  sql =
    "select session_id, unix_timestamp as timestamp, longitude, latitude, altitude from GPS_DATA where session_id = 3 order by session_id, unix_timestamp",
  // JSONの出力
  writeJson = (sessionId, file, items) => {
    const outputDirPath = path.join(outputDir, `session${sessionId}`),
      outputFilePath = path.join(outputDirPath, `${file}.json`);

    const obj = items
        .sort((a, b) => a.timestamp - b.timestamp)
        .reduce((result, item) => {
          result[item.time] = item;
          return result;
        }, {}),
      data = Object.keys(obj)
        .sort((a, b) => obj[a].timestamp - obj[b].timestamp)
        .map((key) => obj[key]);

    console.info(outputFilePath);
    fs.mkdirsSync(outputDirPath);
    fs.writeFileSync(outputFilePath, JSON.stringify(data), {
      encoding: "utf-8",
    });
  };

db.each(sql, (err, row) => {
  console.log(row);
});
