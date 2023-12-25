const fs = require('fs-extra'),
  path = require('path'),
  { format, addSeconds } = require('date-fns'),
  _ = require('lodash'),
  sqlite3 = require('sqlite3');

/**
 * Runtasticのセッション毎のトラッキングデータを、JSON形式に変換する。
 * @param {string} dbFilePath sqliteのデータファイルのパス
 * @param {string} jsonDirPath JSONファイルの保存先のパス
 * @returns 
 */
module.exports = function (dbFilePath, jsonDirPath) {
  // SQLiteデータベースのインスタンス作成
  const db = new sqlite3.Database(path.resolve(dbFilePath)),
    // セッション情報取得用のSQL
    SESSION_SQL =
      'select session_id, global_session_id, start_timestamp, end_timestamp, description from SESSION_DATA order by session_id',
    SQL = {
      // GPS情報取得用のSQL
      GPS: (sessionId) =>
        `select session_id, unix_timestamp as timestamp, longitude, latitude, altitude from GPS_DATA where session_id = ${sessionId} order by session_id, unix_timestamp`,
      // ケイデンス情報取得用のSQL
      CADENCE: (sessionId) =>
        `select session_id, timestamp * 1000 as timestamp, cadence from CADENCE where session_id = ${sessionId} order by session_id, timestamp`,
      // 速度情報取得用のSQL (StravaではGPS情報から速度を算出しているので今回は取得しない)
      // SPEED: (sessionId) =>
      //   `select session_id, timestamp * 1000 as timestamp, speed from SPEED where session_id = ${sessionId} order by session_id, timestamp`,
      // 心拍数情報取得用のSQL (今回取得するトラッキングデータには心拍数情報があるものが殆ど無いため取得しない)
      // HEARTRATE: (sessionId) =>
      //   `select session_id, timestamp * 1000 as timestamp, heartrate from HEARTRATE where session_id = ${sessionId} order by session_id, timestamp`,
    },
    // sqliteからセッションの詳細を取得する
    selectSessionDetail = (sessionId, type) =>
      new Promise((resolve) => {
        const rows = [];
        db.each(
          // 実行するSQLを取得
          SQL[type](sessionId),
          // 1行毎のコールバック
          (err, row) => {
            if (row.timestamp) {
              const date = new Date(row.timestamp);
              // ミリ秒は切り捨て
              date.setMilliseconds(0);
              row.timestamp = date.getTime();
              row.time = format(row.timestamp, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            }
            rows.push(row);
          },
          // 全行取得後の処理
          () => {
            resolve({ sessionId, type, rows });
          }
        );
      }),
    // タイムスタンプの近いデータを取得する
    getNearlyTimeValue = (items, prop, timestamp) => {
      // まず完全に一致するものを取得
      const index = _.findIndex(items, (v) => timestamp === v.timestamp);
      if (index > -1) {
        // 同じ時間のものがある場合
        return items[index][prop];
      } else if (items.length) {
        // 同じ時間のものがない場合
        // 誤差-4ms～4msのものを先勝ちで取得
        const timestampMinus = addSeconds(timestamp, -4),
          timestampPlus = addSeconds(timestamp, 4),
          indexInRange = _.findIndex(
            items,
            (v) => timestampMinus <= v.timestamp && v.timestamp <= timestampPlus
          );
        if (indexInRange > -1) {
          // 誤差ありのものがある場合
          return items[indexInRange][prop];
        }
      }
    },
    // セッションの詳細を出力する
    writeSessionDetails = (sessionId) =>
      new Promise((resolve) => {
        const promises = [];
        // 対象のデータを取得
        for (const type of Object.keys(SQL)) {
          promises.push(selectSessionDetail(sessionId, type));
        }
        return Promise.all(promises)
          .then((data) => {
            // session毎に結果をマージする
            let sessionId, gpses, cadences;
            // 各typeの結果を1つのデータにに統合する
            data.forEach((item) => {
              const dataType = item.type;
              if (dataType === 'GPS') {
                sessionId = item.sessionId;
                gpses = item.rows;
              } else if (dataType === 'CADENCE') {
                cadences = item.rows;
              }
            });
            // gpsへ他の情報を反映
            const result = gpses.map((gps, i) => {
              // gpsを取得したタイムスタンプ
              const timestamp = gps.timestamp;
              // 各データのタイムスタンプは同期していない為、gpsのタイムスタンプに近いケイデンス情報を取得する
              const cadence = getNearlyTimeValue(cadences, 'cadence', timestamp);
              if (cadence != null) {
                // ケイデンス情報は取得できたときのみ設定
                gps.cadence = cadence;
              }
              return gps;
            });
            // セッションの詳細をファイルへ出力
            const outputFilePath = path.join(jsonDirPath, `session${sessionId}`, `DATA.json`);
            fs.writeFileSync(outputFilePath, JSON.stringify(result), {
              encoding: 'utf-8',
            });
            console.info(outputFilePath);
          })
          .then(() => resolve());
      });

  fs.removeSync(jsonDirPath);
  fs.mkdirsSync(jsonDirPath);

  // セッションのデータを全件取得しJSONファイルで出力
  const sessionIds = [];
  return new Promise((resolve) => {
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
        // セッションの情報をファイルへ出力
        const outputDirPath = path.join(outputDirPath, `session${sessionId}`),
          outputFilePath = path.join(outputDirPath, 'SESSION.json');
        fs.mkdirsSync(outputDirPath);
        fs.writeFileSync(outputFilePath, JSON.stringify(session), {
          encoding: 'utf-8',
        });
      },
      () => resolve()
    );
  })
    .then(() => {
      // 各セッションの詳細データを作成
      const promises = [];
      for (const sessionId of sessionIds) {
        promises.push(writeSessionDetails(sessionId));
      }
      // 各セッションの詳細を全て出力できたら処理完了
      return Promise.all(promises);
    })
    .then(() => {
      db.close();
      console.log('finish');
    });
}
