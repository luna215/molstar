/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Viewport } from '../../mol-canvas3d/camera/util';
import { PluginContext } from '../../mol-plugin/context';
import { ViewportScreenshotHelper } from '../../mol-plugin/util/viewport-screenshot';
import { shallowEqual } from '../../mol-util/object';
import { useBehavior } from '../hooks/use-behavior';

export interface ScreenshotPreviewProps {
    plugin: PluginContext,
    suspend?: boolean,
    cropFrameColor?: string,
    borderColor?: string,
    borderWidth?: number,
    customBackground?: string
}

const _ScreenshotPreview = (props: ScreenshotPreviewProps) => {
    const { plugin, cropFrameColor } = props;

    const helper = plugin.helpers.viewportScreenshot!;
    const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const propsRef = useRef(props);

    useEffect(() => {
        propsRef.current = props;
    }, Object.values(props));

    useEffect(() => {
        if (currentCanvas !== canvasRef.current) {
            setCurrentCanvas(canvasRef.current);
        }
    });

    useEffect(() => {
        let paused = false;
        const updateQueue = new Subject();
        const subs: Subscription[] = [];

        function subscribe<T>(xs: Observable<T> | undefined, f: (v: T) => any) {
            if (!xs) return;
            subs.push(xs.subscribe(f));
        }

        function preview() {
            const p = propsRef.current;
            if (!p.suspend && !paused && canvasRef.current) {
                drawPreview(helper, canvasRef.current, p.customBackground, p.borderColor, p.borderWidth);
            }

            if (!canvasRef.current) updateQueue.next();
        }

        subscribe(updateQueue.pipe(debounceTime(33)), preview);
        subscribe(plugin.events.canvas3d.settingsUpdated, () => updateQueue.next());

        subscribe(plugin.canvas3d?.didDraw.pipe(debounceTime(150)), () => {
            if (paused) return;
            updateQueue.next();
        });

        subscribe(plugin.state.data.behaviors.isUpdating, v => {
            paused = v;
            if (!v) updateQueue.next();
        });

        subscribe(helper.behaviors.values, () => updateQueue.next());
        subscribe(helper.behaviors.cropParams, () => updateQueue.next());

        let resizeObserver: any = void 0;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => updateQueue.next());
        }

        const canvas = canvasRef.current;
        resizeObserver?.observe(canvas);

        preview();

        return () => {
            subs.forEach(s => s.unsubscribe());
            resizeObserver?.unobserve(canvas);
        };
    }, [helper]);

    return <>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <canvas ref={canvasRef} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} style={{ display: 'block', width: '100%', height: '100%' }}></canvas>
            <ViewportFrame plugin={plugin} canvas={currentCanvas} color={cropFrameColor} />
        </div>
    </>;
};

export const ScreenshotPreview = React.memo(_ScreenshotPreview, (prev, next) => shallowEqual(prev, next));

declare const ResizeObserver: any;

function drawPreview(helper: ViewportScreenshotHelper, target: HTMLCanvasElement, customBackground?: string, borderColor?: string, borderWidth?: number) {
    const { canvas, width, height } = helper.getPreview()!;
    const ctx = target.getContext('2d');
    if (!ctx) return;

    const w = target.clientWidth;
    const h = target.clientHeight;
    target.width = w;
    target.height = h;

    ctx.clearRect(0, 0, w, h);
    const frame = getViewportFrame(width, height, w, h);

    if (customBackground) {
        ctx.fillStyle = customBackground;
        ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    } else if (helper.values.transparent) {
        // must be an odd number
        const s = 13;
        for (let i = 0; i < frame.width; i += s) {
            for (let j = 0; j < frame.height; j += s) {
                ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#bfbfbf';

                const x = frame.x + i, y = frame.y + j;
                const w = i + s > frame.width ? frame.width - i : s;
                const h = j + s > frame.height ? frame.height - j : s;
                ctx.fillRect(x, y, w, h);
            }
        }
    }
    ctx.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);

    if (borderColor && borderWidth) {
        const w = borderWidth;
        ctx.rect(frame.x, frame.y, frame.width, frame.height);
        ctx.rect(frame.x + w, frame.y + w, frame.width - 2 * w, frame.height - 2 * w);
        ctx.fillStyle = borderColor;
        ctx.fill('evenodd');
    }
}

function ViewportFrame({ plugin, canvas, color = 'rgba(255, 87, 45, 0.75)' }: { plugin: PluginContext, canvas: HTMLCanvasElement | null, color?: string }) {
    const helper = plugin.helpers.viewportScreenshot;
    const params = useBehavior(helper?.behaviors.values!);
    const cropParams = useBehavior(helper?.behaviors.cropParams!);
    const crop = useBehavior(helper?.behaviors.relativeCrop!);
    const cropFrameRef = useRef<Viewport>({ x: 0, y: 0, width: 0, height: 0 });
    useBehavior(params?.resolution.name === 'viewport' ? plugin.canvas3d?.resized : void 0);

    const [drag, setDrag] = React.useState<string>('');
    const [start, setStart] = useState([0, 0]);
    const [current, setCurrent] = useState([0, 0]);

    if (!helper || !canvas) return null;

    const { width, height } = helper.getSizeAndViewport();

    const frame = getViewportFrame(width, height, canvas.clientWidth, canvas.clientHeight);

    const cropFrame: Viewport = {
        x: frame.x + Math.floor(frame.width * crop.x),
        y: frame.y + Math.floor(frame.height * crop.y),
        width: Math.ceil(frame.width * crop.width),
        height: Math.ceil(frame.height * crop.height)
    };

    const rectCrop = toRect(cropFrame);
    const rectFrame = toRect(frame);

    if (drag === 'move') {
        rectCrop.l += current[0] - start[0];
        rectCrop.r += current[0] - start[0];
        rectCrop.t += current[1] - start[1];
        rectCrop.b += current[1] - start[1];
    } else if (drag) {
        if (drag.indexOf('left') >= 0) {
            rectCrop.l += current[0] - start[0];
        } else if (drag.indexOf('right') >= 0) {
            rectCrop.r += current[0] - start[0];
        }

        if (drag.indexOf('top') >= 0) {
            rectCrop.t += current[1] - start[1];
        } else if (drag.indexOf('bottom') >= 0) {
            rectCrop.b += current[1] - start[1];
        }
    }

    if (rectCrop.l > rectCrop.r) {
        const t = rectCrop.l;
        rectCrop.l = rectCrop.r;
        rectCrop.r = t;
    }

    if (rectCrop.t > rectCrop.b) {
        const t = rectCrop.t;
        rectCrop.t = rectCrop.b;
        rectCrop.b = t;
    }

    const pad = 40;
    rectCrop.l = Math.min(rectFrame.r - pad, Math.max(rectFrame.l, rectCrop.l));
    rectCrop.r = Math.max(rectFrame.l + pad, Math.min(rectFrame.r, rectCrop.r));
    rectCrop.t = Math.min(rectFrame.b - pad, Math.max(rectFrame.t, rectCrop.t));
    rectCrop.b = Math.max(rectFrame.t + pad, Math.min(rectFrame.b, rectCrop.b));

    cropFrame.x = rectCrop.l;
    cropFrame.y = rectCrop.t;
    cropFrame.width = rectCrop.r - rectCrop.l + 1;
    cropFrame.height = rectCrop.b - rectCrop.t + 1;

    cropFrameRef.current = cropFrame;

    const onMove = (e: MouseEvent) => {
        e.preventDefault();
        setCurrent([e.pageX, e.pageY]);
    };

    const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.touches[0];
        setCurrent([t.pageX, t.pageY]);
    };

    const onTouchStart = (e: React.TouchEvent) => {
        e.preventDefault();
        setDrag(e.currentTarget.getAttribute('data-drag')! as any);
        const t = e.touches[0];
        const p = [t.pageX, t.pageY];
        setStart(p);
        setCurrent(p);
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchmove', onTouchMove);
    };

    const onStart = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        setDrag(e.currentTarget.getAttribute('data-drag')! as any);
        const p = [e.pageX, e.pageY];
        setStart(p);
        setCurrent(p);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('mousemove', onMove);
    };

    const onEnd = () => {
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('mousemove', onMove);
        finish();
    };

    const onTouchEnd = () => {
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchmove', onTouchMove);
        finish();
    };

    function finish() {
        const cropFrame = cropFrameRef.current;
        if (cropParams.auto) {
            helper?.behaviors.cropParams.next({ ...cropParams, auto: false });
        }
        helper?.behaviors.relativeCrop.next({
            x: (cropFrame.x - frame.x) / frame.width,
            y: (cropFrame.y - frame.y) / frame.height,
            width: cropFrame.width / frame.width,
            height: cropFrame.height / frame.height
        });
        setDrag('');
        const p = [0, 0];
        setStart(p);
        setCurrent(p);
    }

    const contextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const d = 4;
    const border = `3px solid ${color}`;
    const transparent = 'transparent';

    return <>
        <div data-drag='move' style={{ position: 'absolute', left: cropFrame.x, top: cropFrame.y, width: cropFrame.width, height: cropFrame.height, border, cursor: 'move' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />

        <div data-drag='left' style={{ position: 'absolute', left: cropFrame.x - d, top: cropFrame.y + d, width: 4 * d, height: cropFrame.height - d, background: transparent, cursor: 'w-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='right' style={{ position: 'absolute', left: rectCrop.r - 2 * d, top: cropFrame.y, width: 4 * d, height: cropFrame.height - d, background: transparent, cursor: 'w-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='top' style={{ position: 'absolute', left: cropFrame.x - d, top: cropFrame.y - d, width: cropFrame.width + 2 * d, height: 4 * d, background: transparent, cursor: 'n-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='bottom' style={{ position: 'absolute', left: cropFrame.x - d, top: rectCrop.b - 2 * d, width: cropFrame.width + 2 * d, height: 4 * d, background: transparent, cursor: 'n-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />

        <div data-drag='top, left' style={{ position: 'absolute', left: rectCrop.l - d, top: rectCrop.t - d, width: 4 * d, height: 4 * d, background: transparent, cursor: 'nw-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='bottom, right' style={{ position: 'absolute', left: rectCrop.r - 2 * d, top: rectCrop.b - 2 * d, width: 4 * d, height: 4 * d, background: transparent, cursor: 'nw-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='top, right' style={{ position: 'absolute', left: rectCrop.r - 2 * d, top: rectCrop.t - d, width: 4 * d, height: 4 * d, background: transparent, cursor: 'ne-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
        <div data-drag='bottom, left' style={{ position: 'absolute', left: rectCrop.l - d, top: rectCrop.b - 2 * d, width: 4 * d, height: 4 * d, background: transparent, cursor: 'ne-resize' }} onMouseDown={onStart} onTouchStart={onTouchStart} draggable={false} onContextMenu={contextMenu} />
    </>;
}

function toRect(viewport: Viewport) {
    return { l: viewport.x, t: viewport.y, r: viewport.x + viewport.width - 1, b: viewport.y + viewport.height - 1 };
}

function getViewportFrame(srcWidth: number, srcHeight: number, w: number, h: number): Viewport {
    const a0 = srcWidth / srcHeight;
    const a1 = w / h;

    if (a0 <= a1) {
        const t = h * a0;
        return { x: Math.round((w - t) / 2), y: 0, width: Math.round(t), height: h };
    } else {
        const t = w / a0;
        return { x: 0, y: Math.round((h - t) / 2), width: w, height: Math.round(t) };
    }
}