import { initializeApp } from "@firebase/app"
import { getDatabase, connectDatabaseEmulator } from "@firebase/database"

import type { MapOf, ServerTimestamp } from "../src/index"
import { RealtimeDatabase } from "../src/index"

const app = initializeApp({ projectId: "demo-firesnake" })
const database = getDatabase(app)
connectDatabaseEmulator(database, "localhost", 9000)

type Article = {
  text: string
  createdTime: ServerTimestamp
}

type User = {
  name: string
  age: number
  articles?: MapOf<Article>
}

type Database = {
  users: MapOf<User>
}

const rtdb = new RealtimeDatabase<Database>(database)

async function clearDatabase() {
  await rtdb.put(null)
}

afterEach(async () => {
  await clearDatabase()
})

test("create user", async () => {
  const userId = await rtdb._("users").push({ name: "fuurin", age: 20 })
  expect(userId).toBeTruthy()
  const user = await rtdb._("users")._(userId).get()
  expect(user.name).toBe("fuurin")
  expect(user.age).toBe(20)
})
