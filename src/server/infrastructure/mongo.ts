import { MongoClient, ObjectId } from "mongodb";
import type { Database } from "../domain/ports";

/**
 * MongoDB adapter. A single shared client is created once in the container
 * (unlike the original MakeDb(), which created a client per call).
 */
export async function makeDatabase(
  dbUrl: string,
  dbName: string
): Promise<Database> {
  const client = new MongoClient(dbUrl, {
    serverSelectionTimeoutMS: 15000,
  });
  await client.connect();
  const db = client.db(dbName);

  const database: Database = {
    MakeId(id: string) {
      try {
        return new ObjectId(id);
      } catch {
        return id;
      }
    },
    MakeDate() {
      return Date.now();
    },
    collection(name: string) {
      return db.collection(name);
    },
  };

  return database;
}
