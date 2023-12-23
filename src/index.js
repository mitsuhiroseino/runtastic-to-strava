const fs = require("fs-extra"),
  path = require("path"),
  INPUT_DIR = path.resolve("./resources/json"),
  OUTPUT_DIR = path.resolve("./resources/gpx");

const { buildGPX, StravaBuilder } = require("gpx-builder");
const { Point } = StravaBuilder.MODELS;

fs.removeSync(OUTPUT_DIR);
fs.mkdirsSync(OUTPUT_DIR);

const items = fs.readdirSync(INPUT_DIR, { withFileTypes: true });
for (const item of items) {
  if (item.isDirectory()) {
    const sessionPath = path.join(INPUT_DIR, item.name, "SESSION.json"),
      session = fs.readJSONSync(sessionPath, { encoding: "utf-8" });
    const dataPath = path.join(INPUT_DIR, item.name, "DATA.json"),
      data = fs.readJSONSync(dataPath, { encoding: "utf-8" });

    const points = data.map(
      (item) =>
        new Point(item.latitude, item.longitude, {
          ele: item.altitude,
          time: new Date(item.timestamp),
          cad: item.cadence,
        })
    );

    const gpxData = new StravaBuilder();
    gpxData.setSegmentPoints(points);

    const outputFilePath = path.join(
      OUTPUT_DIR,
      `session${session.session_id}.gpx`
    );
    fs.writeFileSync(outputFilePath, buildGPX(gpxData.toObject()), {
      encoding: "utf-8",
    });
    console.info(outputFilePath);
  }
}
