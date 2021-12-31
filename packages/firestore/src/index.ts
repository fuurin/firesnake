import type {
  Firestore,
  FirestoreError,
  OrderByDirection,
  QueryConstraint,
  Unsubscribe,
  WhereFilterOp
} from "@firebase/firestore"

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "@firebase/firestore"

// Default Data key and Subcollection key
type DataKey = "data"
type SubKey = "sub"
export type CollectionOf<D extends DocumentDefinition<DataKey, SubKey>> = Record<string, D>

type MapOf<T> = Record<string, T>
export type DocumentDefinition<DK extends string, SK extends string> = {
  [key in DK]: { [key: string]: unknown }
} & {
  [key in SK]?: { [key: string]: CollectionDefinition<DK, SK> }
}
type CollectionDefinition<DK extends string, SK extends string> = MapOf<DocumentDefinition<DK, SK>>
type DocumentKeyOf<
  C extends MapOf<DocumentDefinition<DK, SK>>,
  DK extends string,
  SK extends string
> = C extends MapOf<infer D> ? (D extends DocumentDefinition<DK, SK> ? keyof D[DK] : never) : never
type DocumentValueOf<
  C extends CollectionDefinition<DK, SK>,
  K extends DocumentKeyOf<C, DK, SK>,
  DK extends string,
  SK extends string
> = C extends MapOf<infer D> ? (D extends DocumentDefinition<DK, SK> ? D[DK][K] : never) : never
type SubCollectionKeyOf<
  D extends DocumentDefinition<DK, SK>,
  DK extends string,
  SK extends string
> = D[SK] extends null ? never : keyof D[SK]
type ChildValueOf<
  C extends CollectionDefinition<DK, SK>,
  DK extends string,
  SK extends string
> = C extends MapOf<infer D> ? (D extends DocumentDefinition<DK, SK> ? D[DK] : never) : never
type DocumentOf<C extends CollectionDefinition<DK, SK>, DK extends string, SK extends string> = {
  id: string
  data: ChildValueOf<C, DK, SK>
}

export type ServerTimestamp = ReturnType<typeof serverTimestamp>

class FirestorePath {
  constructor(protected readonly firestore: Firestore, protected readonly path: string) {}
}

class FirestoreDocument<
  D extends DocumentDefinition<DK, SK>,
  DK extends string,
  SK extends string
> extends FirestorePath {
  private reportError(e: FirestoreError) {
    console.error(`An error occured in FirebaseDocument, path: ${this.getPath()}, error: ${e}`)
  }

  private getDocRef() {
    return doc(this.firestore, this.getPath())
  }

  public _<K extends SubCollectionKeyOf<D, DK, SK>, C extends D[SK][K]>(key: K) {
    return new FirestoreCollection<C, DK, SK>(this.firestore, this.getPath(key))
  }

  public getPath(key?: SubCollectionKeyOf<D, DK, SK>) {
    return typeof key === "undefined" ? this.path : `${this.path}/${key}`
  }

  public defineData() {
    return null as D[DK] | null
  }

  public async get() {
    const snapshot = await getDoc(this.getDocRef())
    return snapshot.exists() ? (snapshot.data() as D[DK]) : null
  }

  public async put(data: D[DK]) {
    try {
      await setDoc(this.getDocRef(), data)
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }

  public async update<K extends keyof D[DK]>(data: { [key in K]: D[DK][key] }) {
    try {
      await updateDoc(this.getDocRef(), data)
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }

  // @TODO: ドキュメントを削除するとき、デフォルトでそれ以下のサブコレクションを再帰的に削除するようにしたい
  public async delete() {
    try {
      await deleteDoc(this.getDocRef())
      return true
    } catch (e) {
      this.reportError(e)
      return false
    }
  }

  public onUpdate(callback: (data: D[DK] | null) => void) {
    this.unsubscribeOnUpdate = onSnapshot(
      this.getDocRef(),
      snapshot => {
        callback(snapshot.exists() ? (snapshot.data() as D[DK]) : null)
      },
      e => this.reportError(e)
    )
  }

  public unsubscribeOnUpdate: Unsubscribe = () => {
    return
  }
}

class FirestoreCollection<
  C extends CollectionDefinition<DK, SK>,
  DK extends string,
  SK extends string
> extends FirestorePath {
  private skipKey = "_"
  private whereConstraints: QueryConstraint[] = []
  private orderConstraints: QueryConstraint[] = []
  private limitConstraint: QueryConstraint | null = null

  private reportError(e: FirestoreError) {
    console.error(`An error occured in FirebaseCollection, path: ${this.getPath()}, error: ${e}`)
  }

  private getCollectionRef() {
    return collection(this.firestore, this.getPath())
  }

  private getQuery() {
    if (this.limitConstraint) {
      return query(
        this.getCollectionRef(),
        ...this.whereConstraints,
        ...this.orderConstraints,
        this.limitConstraint
      )
    } else {
      return query(this.getCollectionRef(), ...this.whereConstraints, ...this.orderConstraints)
    }
  }

  public _<K extends string, D extends C extends MapOf<infer U> ? U : never>(key: K) {
    if (key === "") {
      throw new Error("The key for the Firestore Document cannot be empty")
    }
    if (key === this.skipKey) {
      throw new Error(
        `The Firestore Document key "${this.skipKey}" is reserved for skipping the path. Use "_none" method for the purpose.`
      )
    }
    return new FirestoreDocument<D, DK, SK>(this.firestore, this.getPath(key))
  }

  public _none<D extends C extends MapOf<infer U> ? U : never>() {
    return new FirestoreDocument<D, DK, SK>(this.firestore, this.getPath(this.skipKey))
  }

  public defineDocument() {
    return null as DocumentOf<C, DK, SK> | null
  }

  public defineDocumentArray() {
    return null as DocumentOf<C, DK, SK>[] | null
  }

  public getPath(key?: string) {
    return typeof key === "undefined" ? this.path : `${this.path}/${key}`
  }

  // @TODO: 範囲比較（<、<=、>、>=）のフィルタがある場合、最初の並べ替えは同じフィールドで行う必要があります。への対応
  //        KにFirestorePathを受け取れるようにする対応
  //        documentIDに対するクエリを打てるようにする対応
  //        これだと1つの条件しか入れられないのでadd, run形式に直す
  public setWhere<
    K extends DocumentKeyOf<C, DK, SK>,
    O extends V extends unknown[]
      ? WhereFilterOp
      : Exclude<WhereFilterOp, "array-contains" | "array-contains-any">,
    V extends DocumentValueOf<C, K, DK, SK>
  >(...conditions: [K, O, O extends "in" | "not-in" ? V[] : V][]) {
    this.whereConstraints = conditions.map(condition =>
      where(condition[0] as string, condition[1], condition[2])
    )
    return this
  }

  public setOrder<K extends DocumentKeyOf<C, DK, SK>>(...conditions: [K, OrderByDirection?][]) {
    this.orderConstraints = conditions.map(condition =>
      orderBy(condition[0] as string, condition[1] || "asc")
    )
    return this
  }

  public setLimit(limitNum: number) {
    this.limitConstraint = limit(limitNum)
    return this
  }

  // @TODO: 取得時にページングできるようにする？
  public async get() {
    try {
      const queryResult = await getDocs(this.getQuery())
      const docs: DocumentOf<C, DK, SK>[] = []
      queryResult.forEach(doc =>
        docs.push({ id: doc.id, data: doc.data() as ChildValueOf<C, DK, SK> })
      )
      return docs
    } catch (e) {
      this.reportError(e)
      return null
    }
  }

  // @TODO: コレクショングループの取得
  // public async getGroup() {}

  // @TODO: バッチによる一括プッシュもできるようにしたい
  public async push(data: ChildValueOf<C, DK, SK>) {
    try {
      const docRef = await addDoc(this.getCollectionRef(), data)
      return docRef.id
    } catch (e) {
      this.reportError(e)
      return null
    }
  }

  // @TODO: 取得時にページングできるようにする？
  public onUpdate(callback: (data: DocumentOf<C, DK, SK>[]) => void) {
    this.unsubscribeOnUpdate = onSnapshot(
      this.getQuery(),
      snapshots => {
        const resultData: DocumentOf<C, DK, SK>[] = []
        snapshots.forEach(snapshot =>
          resultData.push({ id: snapshot.id, data: snapshot.data() as ChildValueOf<C, DK, SK> })
        )
        callback(resultData)
      },
      e => this.reportError(e)
    )
  }

  public unsubscribeOnUpdate: Unsubscribe = () => {
    return
  }

  public onUpdateForEach(callback: (id: string, data: ChildValueOf<C, DK, SK>) => void) {
    this.unsubscribeOnUpdateForEach = onSnapshot(
      this.getQuery(),
      snapshots => {
        snapshots.forEach(snapshot =>
          callback(snapshot.id, snapshot.data() as ChildValueOf<C, DK, SK>)
        )
      },
      e => this.reportError(e)
    )
  }

  public unsubscribeOnUpdateForEach: Unsubscribe = () => {
    return
  }
}

export class FirestoreDatabase<
  R extends { [key: string]: CollectionDefinition<DK, SK> },
  DK extends string = DataKey,
  SK extends string = SubKey
> {
  constructor(private readonly firestore: Firestore) {}

  public _<K extends keyof R>(key: K) {
    return new FirestoreCollection<R[K], DK, SK>(this.firestore, key as string)
  }

  public serverTimestamp(): ServerTimestamp {
    return serverTimestamp()
  }

  public dateFromServerTimestamp(timestamp: ServerTimestamp) {
    try {
      const seconds = timestamp["seconds"] as number
      const nanoseconds = timestamp["nanoseconds"] as number
      return new Date(Number(seconds.toString() + nanoseconds.toString().slice(0, 3)))
    } catch (e) {
      return null
    }
  }
}
