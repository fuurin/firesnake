import type { Database, Unsubscribe, QueryConstraint } from "@firebase/database"
import {
  get,
  onValue,
  orderByChild,
  orderByKey,
  orderByPriority,
  orderByValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update
} from "@firebase/database"

export type MapOf<T> = Record<string, T>
type KV = { [key: string]: unknown }
type KeyOf<T> = T extends unknown[]
  ? number
  : T extends KV
  ? keyof T
  : T extends MapOf<unknown>
  ? string
  : never
type ValueOf<T, K extends KeyOf<T>> = T extends (infer U)[]
  ? U
  : T extends KV
  ? T[K]
  : T extends MapOf<infer U>
  ? U
  : never
type ChildKeyOf<T> = T extends (infer U)[] | MapOf<infer U> ? KeyOf<U> : never
type ChildValueOf<T> = T extends MapOf<infer U> ? U : never

export type ServerTimestamp = ReturnType<typeof serverTimestamp>

class RealtimeDatabasePath<T> {
  constructor(protected readonly path: string = "") {}

  public _<K extends KeyOf<T>>(key: K) {
    if (key === "") {
      throw new Error("The key for the next value of RealtimeDatabasePath cannot be empty")
    }
    return new RealtimeDatabasePath<ValueOf<T, K>>(this.getPath(key))
  }

  public getPath(key?: KeyOf<T>) {
    if (typeof key === "undefined") {
      return this.path.length === 0 ? "/" : this.path
    }

    return `${this.path}/${key.toString()}`
  }
}

class RealtimeDatabaseObject<T> extends RealtimeDatabasePath<T> {
  private orderConstraints: QueryConstraint[] = []

  constructor(protected readonly db: Database, path = "") {
    super(path)
  }

  protected reportError(e: Error) {
    console.error(`An error occured in RealtimeDatabase, path: ${this.getPath()}, error: ${e}`)
  }

  public _<K extends KeyOf<T>>(key: K) {
    if (key === "") {
      throw new Error("The key for the next value of RealtimeDatabaseObject cannot be empty")
    }
    return new RealtimeDatabaseObject<ValueOf<T, K>>(this.db, this.getPath(key))
  }

  public defineData() {
    return null as T | null
  }

  public getChildPath<K extends KeyOf<T>>(key: K) {
    return new RealtimeDatabasePath<ValueOf<T, K>>(key as string)
  }

  public getRef() {
    return ref(this.db, this.getPath())
  }

  private getQuery() {
    return query(this.getRef(), ...this.orderConstraints)
  }

  public setOrderByChildKeys(...keys: ChildKeyOf<T>[]) {
    this.orderConstraints = keys.map(key => orderByChild(key))
    return this
  }

  public setOrderByChildPaths(...paths: RealtimeDatabasePath<unknown>[]) {
    this.orderConstraints = paths.map(path => orderByChild(path.getPath()))
    return this
  }

  public setOrderByKey() {
    this.orderConstraints = [orderByKey()]
    return this
  }

  public setOrderByValue() {
    this.orderConstraints = [orderByValue()]
    return this
  }

  public setOrderByPriority() {
    this.orderConstraints = [orderByPriority()]
    return this
  }

  public clearOrder() {
    this.orderConstraints = []
    return this
  }

  public async get() {
    try {
      const snapshot = await get(this.getQuery())
      return snapshot.exists() ? (snapshot.val() as T) : null
    } catch (e) {
      this.reportError(e)
      return null
    }
  }

  public async put(data: T) {
    try {
      await set(this.getRef(), data)
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }

  public async push(data: ChildValueOf<T>) {
    try {
      const newPostRef = await push(this.getRef())
      await set(newPostRef, data)
      return newPostRef.key
    } catch (e) {
      this.reportError(e)
      return null
    }
  }

  public async delete() {
    try {
      await remove(this.getRef())
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }

  public onUpdate(callback: (data: T | null) => void) {
    this.unsubscribeOnUpdate = onValue(
      this.getQuery(),
      snapshot => {
        callback(snapshot.exists() ? (snapshot.val() as T) : null)
      },
      e => this.reportError(e)
    )
  }

  public unsubscribeOnUpdate: Unsubscribe = () => {
    return
  }

  public async runTransaction(updateFunc: (data: T | null) => T | null, applyLocally = true) {
    return await runTransaction(this.getRef(), data => updateFunc(data), { applyLocally })
  }
}

export class RealtimeDatabase<T extends KV> extends RealtimeDatabaseObject<T> {
  constructor(db: Database) {
    super(db)
  }

  public serverTimestamp() {
    return serverTimestamp()
  }

  public dateFromServerTimestamp(timestamp: ServerTimestamp) {
    try {
      return new Date(Number(timestamp))
    } catch (e) {
      return null
    }
  }

  private updates = {}

  public addUpdate<
    P extends RealtimeDatabaseObject<unknown>,
    D extends P extends RealtimeDatabaseObject<infer U> ? U : never
  >(rtdbPath: P, data: D) {
    this.updates[rtdbPath.getPath()] = data
    return this
  }

  public getUpdates() {
    return this.updates
  }

  public clearUpdates() {
    this.updates = {}
  }

  public async runUpdates() {
    try {
      await update(ref(this.db), this.updates)
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }
}
