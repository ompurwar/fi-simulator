// Seeds the Common_Collection document in Atlas (findependence DB).
// The app's editors render Type/Frequency/etc options from this doc:
// each entry = [{ text, value }] rendered as option.text / bound as option.value.
require("dotenv").config({ path: ".env.local" });
const { MongoClient } = require("mongodb");

const option = (text, value) => ({ text, value });

const doc = {
  status: "active",
  cashflow_type: [option("periodic", "p"), option("one time", "o")],
  cashflow_frequency: [
    option("monthly", "m"),
    option("quarterly", "q"),
    option("half yearly", "h"),
    option("yearly", "y"),
  ],
  cashflow_category: [option("income", "i"), option("expense", "e")],
  cashflow_change_type: [option("percentage", "p"), option("fixed", "f")],
  cashflow_change_frequency: [
    option("monthly", "m"),
    option("quarterly", "q"),
    option("half yearly", "h"),
    option("yearly", "y"),
  ],
  cashflow_change_category: [option("income", "i"), option("expense", "e")],
  account_category: [
    option("emergency", "e"),
    option("savings", "s"),
    option("investment", "i"),
  ],
  account_type: [option("asset", "a")],
  loan_account_category: [option("personal loan", 3), option("home loan", 1)],
  loan_account_frequency: [option("monthly", "m"), option("yearly", "y")],
  loan_account_type: [option("emi", "emi"), option("lumpsum", "ls")],
  // LOAN_CONSTANTS.TYPE: home=1, car=2, personal=3, credit=4, other=5
  loan_type: [
    option("home loan", 1),
    option("car loan", 2),
    option("personal loan", 3),
    option("credit card", 4),
    option("other", 5),
  ],
};

(async () => {
  const client = new MongoClient(process.env.DB_URL);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const col = db.collection("Common_Collection");
  const existing = await col.countDocuments();
  if (existing > 0) {
    // update the existing doc's fields in place (no deletes)
    await col.updateOne({}, { $set: doc });
    console.log("updated existing Common_Collection doc");
    await client.close();
    return;
  }
  await col.insertOne(doc);
  const count = await col.countDocuments();
  console.log("seeded Common_Collection doc, count:", count);
  await client.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
