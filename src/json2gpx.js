const fs = require('fs-extra'),
  path = require('path'),
  { buildGPX, StravaBuilder } = require('gpx-builder'),
  { Point } = StravaBuilder.MODELS;

/**
 * JSON形式のセッションデータをGPX形式に変換する
 * @param {string} jsonDirPath JSONファイルの保存先のパス
 * @param {string} gpxDirPath GPXファイルの保存先のパス
 * @returns 
 */
module.exports = json2gpx = (jsonDirPath, gpxDirPath) => {

  // 出力先をクリア
  fs.removeSync(gpxDirPath);
  fs.mkdirsSync(gpxDirPath);

  // JSONデータをGPX形式に変換
  const items = fs.readdirSync(jsonDirPath, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      // セッションの情報を取得
      const sessionPath = path.join(jsonDirPath, item.name, 'SESSION.json'),
        session = fs.readJSONSync(sessionPath, { encoding: 'utf-8' });
      // セッションの詳細を取得
      const dataPath = path.join(jsonDirPath, item.name, 'DATA.json'),
        data = fs.readJSONSync(dataPath, { encoding: 'utf-8' });

      // 形式を変換
      const points = data.map(
        (item) =>
          new Point(item.latitude, item.longitude, {
            ele: item.altitude,
            time: new Date(item.timestamp),
            cad: item.cadence,
          })
      );

      // gpxデータにセグメントの情報を設定
      const gpxData = new StravaBuilder();
      gpxData.setSegmentPoints(points);

      // ファイルに出力
      const outputFilePath = path.join(
        gpxDirPath,
        `session${session.session_id}.gpx`
      );
      fs.writeFileSync(outputFilePath, buildGPX(gpxData.toObject()), {
        encoding: 'utf-8',
      });
      console.info(outputFilePath);
    }
  }
};
