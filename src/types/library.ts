export type PdfScope = "root_shared" | "folder_local";

export type Lesson = {
  id: string;
  fileName: string;
  fullPath: string;
  relativePath: string;
  folderPath: string;
  extension: string;
};

export type PdfDocument = {
  id: string;
  fileName: string;
  fullPath: string;
  relativePath: string;
  folderPath: string;
  scope: PdfScope;
};

export type FolderNode = {
  id: string;
  name: string;
  fullPath: string;
  relativePath: string;
  children: FolderNode[];
  lessonIds: string[];
  pdfIds: string[];
};

export type Library = {
  id: string;
  name: string;
  rootPath: string;
  folderTree: FolderNode;
  lessons: Lesson[];
  pdfDocuments: PdfDocument[];
  sharedPdfIds: string[];
};
