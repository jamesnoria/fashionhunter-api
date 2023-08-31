const mongoose = require("mongoose");
const dotenv = require("dotenv");
const app = require("./app");
const listEndpoints = require("express-list-endpoints");

dotenv.config({ path: `${__dirname}/.config.env` });

const DB = process.env.DB.replace("<PASSWORD>", process.env.DB_PASSWORD);

mongoose.set('strictQuery', false);

mongoose.connect(DB).then(() => {
  console.log("✓ DB Connected");
});

const port = process.env.PORT || 8000;
app.listen(port);

if (process.env.NODE_ENV === "development") {
  console.log("Documentacion: https://documenter.getpostman.com/view/18428706/UVyrVciL");
  console.log("--- List of endpoints ---");
  const test = Object.values(listEndpoints(app));
  for (let i = 0; test.length > i; i++) {
    const HttpMethod = String(test[i].methods);
    const endpoint = `http://localhost:${port}${test[i].path}`;
    console.log(`${HttpMethod} - ${endpoint}`);
  }
  console.log("--- End of list ---");
}
