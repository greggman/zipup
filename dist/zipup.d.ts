export type EntryInfo = {
    name: string;
    comment?: string;
    lastModDate?: Date;
    attributes?: number;
};
export declare enum DosAttributes {
    READ_ONLY = 1,
    HIDDEN = 2,
    SYSTEM = 4,
    VOLUME_LABEL = 8,
    DIRECTORY = 16,
    ARCHIVE = 32
}
export declare enum UnixPermissions {
    S_IRUSR = 256,
    S_IWUSR = 128,
    S_IXUSR = 64,
    S_IRGRP = 32,
    S_IWGRP = 16,
    S_IXGRP = 8,
    S_IROTH = 4,
    S_IWOTH = 2,
    S_IXOTH = 1,
    FILE_644 = 420,
    FILE_755 = 493
}
export declare class ZipFolder {
    #private;
    constructor(zip: Zip, name: string);
    addFile(pathOrInfo: string | EntryInfo, data: string | ArrayBuffer | ArrayBufferView | Blob): Promise<void>;
    addFolder(pathOrInfo: string | EntryInfo): ZipFolder;
}
type Platform = 'windows' | 'linux' | 'macos' | 'unix';
export declare class Zip {
    #private;
    constructor(options?: {
        platform?: Platform;
    });
    addFile(pathOrInfo: string | EntryInfo, data: string | ArrayBuffer | ArrayBufferView | Blob): Promise<void>;
    addFolder(name: string | EntryInfo): ZipFolder;
    finalize(comment?: string): Promise<Blob>;
}
export {};
