import {
    BufferAttribute,
    BufferGeometry,
    TrianglesDrawMode,
    TriangleStripDrawMode,
    TriangleFanDrawMode
} from 'three';

function toTrianglesDrawMode(geometry, drawMode) {
    if (drawMode === TrianglesDrawMode) return geometry;

    const index = geometry.getIndex();
    const count = index ? index.count : geometry.attributes.position.count;
    const newIndices = [];

    if (drawMode === TriangleStripDrawMode) {
        for (let i = 0; i < count - 2; i++) {
            if (i % 2 === 0) {
                newIndices.push(index ? index.getX(i) : i);
                newIndices.push(index ? index.getX(i + 1) : i + 1);
                newIndices.push(index ? index.getX(i + 2) : i + 2);
            } else {
                newIndices.push(index ? index.getX(i + 1) : i + 1);
                newIndices.push(index ? index.getX(i) : i);
                newIndices.push(index ? index.getX(i + 2) : i + 2);
            }
        }
    } else if (drawMode === TriangleFanDrawMode) {
        for (let i = 1; i < count - 1; i++) {
            newIndices.push(index ? index.getX(0) : 0);
            newIndices.push(index ? index.getX(i) : i);
            newIndices.push(index ? index.getX(i + 1) : i + 1);
        }
    }

    const newGeometry = geometry.clone();
    newGeometry.setIndex(newIndices);
    newGeometry.clearGroups();
    return newGeometry;
}

export { toTrianglesDrawMode };
