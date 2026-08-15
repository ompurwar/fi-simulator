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
  loan_account_category: [option("personal loan", "pl"), option("home loan", "hl")],
  loan_account_frequency: [option("monthly", "m"), option("yearly", "y")],
  loan_account_type: [option("emi", "emi"), option("lumpsum", "ls")],
  loan_type: [option("fixed rate", "fr"), option("floating rate", "fl")],
};

(async () => {
  const client = new MongoClient(process.env.DB_URL);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const col = db.collection("Common_Collection");
  const existing = await col.countDocuments();
  if (existing > 0) {
    console.log("Common_Collection already has", existing, "doc(s) — not inserting. Remove/merge manually if needed.");
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
