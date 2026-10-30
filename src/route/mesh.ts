// 보행 그물 경로(아3). 구현은 mesh/ 폴더: codec(부호 풀기) → heap → grid(그물 한 장) → router(관문 표·A*) → pull(선 당기기).
export { decodeBits, decodeRuns } from './mesh/codec';
export { lineZ } from './mesh/grid';
export { MeshRouter, type MeshEnd, type MeshGraph, type MeshRoute, type MeshRouteEdge } from './mesh/router';
