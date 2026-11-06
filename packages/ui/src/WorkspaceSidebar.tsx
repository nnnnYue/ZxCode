// 项目树是唯一组织视图；workspace tab 继续只负责导航与执行目录。
// 侧栏换骨架 Phase 3c：旧骨架（SortableWorkspaceSidebar/WorkspaceSidebar/ 等）本批不删，
// 由 Phase 3d 处理退役；本 shim 后旧骨架不再有活代码 import。
export { ProjectSidebar as WorkspaceSidebar } from "@/project-sidebar/index.js";
export type { SidebarFileTreeOpenRequest } from "@/project-sidebar/contract.js";
