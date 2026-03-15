use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub folder_tree: FolderNode,
    pub lessons: Vec<Lesson>,
    pub pdf_documents: Vec<PdfDocument>,
    pub shared_pdf_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub id: String,
    pub name: String,
    pub full_path: String,
    pub relative_path: String,
    pub children: Vec<FolderNode>,
    pub lesson_ids: Vec<String>,
    pub pdf_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    pub id: String,
    pub file_name: String,
    pub full_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub extension: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PdfDocument {
    pub id: String,
    pub file_name: String,
    pub full_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub scope: PdfScope,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PdfScope {
    RootShared,
    FolderLocal,
}
