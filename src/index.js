const path = require('path'),
  sqlite2json = require('./sqlite2json'),
  json2gpx = require('./json2gpx');

const DB_FILE_PATH = path.resolve('./resources/runtastic/Container/Documents/database.sqlite3'),
  JSON_DIR_PATH = path.resolve('./resources/json'),
  GPX_DIR_PATH = path.resolve('./resources/gpx');

// sqliteのデータをJSONに変換
await sqlite2json(DB_FILE_PATH, JSON_DIR_PATH);
// JSONデータをGPX形式に変換
json2gpx(JSON_DIR_PATH, GPX_DIR_PATH);