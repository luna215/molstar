/**
 * Copyright (c) 2017 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * from https://github.com/dsehnal/CIFTools.js
 * @author David Sehnal <david.sehnal@gmail.com>
 */

/**
 * A generic chunked array builder.
 *
 * When adding elements, the array grows by a specified number
 * of elements and no copying is done until ChunkedArray.compact
 * is called.
 */
interface ChunkedArray<T> {
    ctor: { new (size: number): ArrayLike<T> },
    elementSize: number,

    growBy: number,
    allocatedSize: number,
    /** current size of the array */
    elementCount: number,

    currentSize: number,
    currentChunk: any,
    currentIndex: number,

    chunks: any[][]
}

namespace ChunkedArray {
    export function is(x: any): x is ChunkedArray<any> {
        return x.creator && x.chunkSize;
    }

    function allocateNext(array: ChunkedArray<any>) {
        let nextSize = array.growBy * array.elementSize;
        array.currentSize = nextSize;
        array.currentIndex = 0;
        array.currentChunk = new array.ctor(nextSize);
        array.allocatedSize += nextSize;
        array.chunks[array.chunks.length] = array.currentChunk;
    }

    export function add4<T>(array: ChunkedArray<T>, x: T, y: T, z: T, w: T) {
        if (array.currentIndex >= array.currentSize) allocateNext(array);
        const c = array.currentChunk;
        c[array.currentIndex++] = x;
        c[array.currentIndex++] = y;
        c[array.currentIndex++] = z;
        c[array.currentIndex++] = w;
        return array.elementCount++;
    }

    export function add3<T>(array: ChunkedArray<T>, x: T, y: T, z: T) {
        if (array.currentIndex >= array.currentSize) allocateNext(array);
        const c = array.currentChunk;
        c[array.currentIndex++] = x;
        c[array.currentIndex++] = y;
        c[array.currentIndex++] = z;
        return array.elementCount++;
    }

    export function add2<T>(array: ChunkedArray<T>, x: T, y: T) {
        if (array.currentIndex >= array.currentSize) allocateNext(array);
        const c = array.currentChunk;
        c[array.currentIndex++] = x;
        c[array.currentIndex++] = y;
        return array.elementCount++;
    }

    export function add<T>(array: ChunkedArray<T>, x: T) {
        if (array.currentIndex >= array.currentSize) allocateNext(array);
        array.currentChunk[array.currentIndex++] = x;
        return array.elementCount++;
    }

    export function addMany<T>(array: ChunkedArray<T>, data: ArrayLike<T>) {
        const { elementSize } = array;
        for (let i = 0, _i = data.length; i < _i; i += elementSize) {
            if (array.currentIndex >= array.currentSize) allocateNext(array);
            const { currentChunk } = array;
            for (let j = 0; j < elementSize; j++) {
                currentChunk[array.currentIndex++] = data[i + j];
            }
            array.elementCount++;
        }
        return array.elementCount;
    }

    /** If doNotResizeSingleton = true and the data fit into a single chunk, do not resize it. */
    export function compact<T>(array: ChunkedArray<T>, doNotResizeSingleton = false): ArrayLike<T> {
        return _compact(array, doNotResizeSingleton);
    }

    export function _compact<T>(array: ChunkedArray<T>, doNotResizeSingleton: boolean): ArrayLike<T> {
        const { ctor, chunks, currentIndex } = array;

        if (!chunks.length) return new ctor(0);
        if (chunks.length === 1) {
            if (doNotResizeSingleton || currentIndex === array.allocatedSize) {
                return chunks[0];
            }
        }

        let size = 0;
        for (let i = 0, _i = chunks.length - 1; i < _i; i++) size += chunks[i].length;
        size += array.currentIndex;

        const ret = new ctor(size) as any;
        let offset = 0;

        if (ret.buffer) {
            for (let i = 0, _i = chunks.length - 1; i < _i; i++) {
                ret.set(chunks[i], offset);
                offset += chunks[i].length;
            }
        } else {
            for (let i = 0, _i = chunks.length - 1; i < _i; i++) {
                const chunk = chunks[i];
                for (let j = 0, _j = chunk.length; j < _j; j++) ret[offset + j] = chunk[j];
                offset += chunk.length;
            }
        }

        const lastChunk = chunks[chunks.length - 1];
        if (ret.buffer && currentIndex >= array.currentSize) {
            ret.set(lastChunk, offset);
        } else {
            for (let j = 0, _j = lastChunk.length; j < _j; j++) ret[offset + j] = lastChunk[j];
        }

        return ret;
    }

    export function create<T>(ctor: { new (size: number): ArrayLike<T> }, elementSize: number, chunkSize: number): ChunkedArray<T>
    /** The size of the initial chunk is elementSize * initialCount */
    export function create<T>(ctor: { new (size: number): ArrayLike<T> }, elementSize: number, chunkSize: number, initialCount: number): ChunkedArray<T>
    /** Use the provided array as the initial chunk. The size of the array must be divisible by the elementSize */
    export function create<T>(ctor: { new (size: number): ArrayLike<T> }, elementSize: number, chunkSize: number, initialChunk: ArrayLike<T>): ChunkedArray<T>
    export function create<T>(ctor: { new (size: number): ArrayLike<T> }, elementSize: number, chunkSize: number, initialChunkOrCount?: number | ArrayLike<T>): ChunkedArray<T> {
        const ret: ChunkedArray<T> = {
            ctor,
            elementSize,

            growBy: chunkSize,
            allocatedSize: 0,
            elementCount: 0,

            currentSize: 0,
            currentChunk: void 0,
            currentIndex: 0,

            chunks: []
        };

        if (typeof initialChunkOrCount === 'undefined') return ret;

        if (typeof initialChunkOrCount === 'number') {
            ret.currentChunk = new ctor(initialChunkOrCount * elementSize);
            ret.allocatedSize = initialChunkOrCount * elementSize;
            ret.currentSize = ret.currentChunk.length;
            ret.chunks[0] = ret.currentChunk;
            return ret;
        }

        const initialChunk = initialChunkOrCount;
        if (initialChunk.length % elementSize !== 0) throw new Error('initialChunk length must be a multiple of the element size.');
        ret.currentChunk = initialChunk;
        ret.allocatedSize = initialChunk.length;
        ret.currentSize = initialChunk.length;
        ret.chunks[0] = initialChunk as any;

        return ret;
    }
}

export { ChunkedArray }