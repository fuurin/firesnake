import { initializeApp } from "@firebase/app"
import { getFirestore, connectFirestoreEmulator } from "@firebase/firestore"
import axios from "axios"

import type { CollectionOf, ServerTimestamp } from "../src/index"
import { FirestoreDatabase } from "../src/index"

const projectId = "demo-firesnake"
const app = initializeApp({ projectId })
const firestore = getFirestore(app)
connectFirestoreEmulator(firestore, "localhost", 8999)

type Article = {
  data: {
    text: string
    createdTime: ServerTimestamp
  }
}

type User = {
  data: {
    name: string
    age: number
  }
  sub: {
    articles: CollectionOf<Article>
  }
}

type Database = {
  users: CollectionOf<User>
}

const fsdb = new FirestoreDatabase<Database>(firestore)

async function clearFirestore() {
  await axios.delete(
    `http://localhost:8999/emulator/v1/projects/${projectId}/databases/(default)/documents`
  )
}

afterEach(async () => {
  await clearFirestore()
})

test("create user", async () => {
  const userId = await fsdb._("users").push({ name: "fuurin", age: 20 })
  expect(userId).toBeTruthy()
  const user = await fsdb._("users")._(userId).get()
  expect(user.name).toBe("fuurin")
  expect(user.age).toBe(20)
})
