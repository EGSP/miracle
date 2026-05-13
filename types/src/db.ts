export type UnixTimestamp = number;

export type DbEntity = {
    id: string;
    createdAt: UnixTimestamp;
    updatedAt: UnixTimestamp;
    deletedAt?: UnixTimestamp | null;
};

export type Stored<T extends object> = T & DbEntity;