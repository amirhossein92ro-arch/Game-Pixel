/** Internal, privileged storage contracts. Public API projection and authorization remain in services. */
export type Identifier = string | number;
export interface PageQuery { page?: number; pageSize?: number; }
export interface Page<T> { items:T[]; total:number; page:number; pageSize:number; }
export interface VersionOptions { expectedRevision?:number; requireRevision?:boolean; }
export interface Repository<T extends {id:Identifier}> {
    findById(id:Identifier):T | undefined;
    findMany(query?:PageQuery):Page<T>;
    count():number;
    create(value:T):T;
    update(id:Identifier, change:(current:T)=>T, options?:VersionOptions):T;
    delete(id:Identifier, options?:VersionOptions):T;
    softDelete(id:Identifier, options?:VersionOptions):T;
}
export interface UnitOfWork {
    /** Current SQLite transactions are synchronous, nested savepoints are supported. Never await here. */
    transaction<T>(work:()=>T):T;
    repositories:Readonly<Record<string, Repository<any>>>;
    ready():boolean;
    close():void;
}
/** A PostgreSQL adapter requires an explicit async service transition, not a Promise hidden in this API. */
export interface AsyncUnitOfWork {
    transaction<T>(work:(transaction:AsyncUnitOfWork)=>Promise<T>):Promise<T>;
    close():Promise<void>;
}
