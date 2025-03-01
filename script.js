import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(
    window.innerWidth / -2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    window.innerHeight / -2,
    1,
    1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 10;
scene.background = new THREE.Color(0xffffff);

const STATE_RADIUS = 30;
const FINAL_STATE_OUTER_RADIUS = STATE_RADIUS + 8;
const MIN_STATE_DISTANCE = STATE_RADIUS * 2.5;

class AFD {
    constructor() {
        this.states = new Map();
        this.transitions = [];
        this.initialState = null;
        this.selfLoops = new Map();
    }

    addState(name, isInitial = false, isFinal = false) {
        this.states.set(name, {
            position: new THREE.Vector2(),
            isInitial,
            isFinal
        });
        if (isInitial) this.initialState = name;
    }

    addTransition(from, to, symbol) {
        if (from === to) {
            if (!this.selfLoops.has(from)) {
                this.selfLoops.set(from, []);
            }
            this.selfLoops.get(from).push(symbol);
        } else {
            this.transitions.push({ from, to, symbol });
        }
    }

    layout() {
        const stateCount = this.states.size;
        const stateNames = Array.from(this.states.keys());

        if (this.initialState) {
            const initialStatePos = this.states.get(this.initialState).position;
            initialStatePos.x = -window.innerWidth / 6;
            initialStatePos.y = 0;
        }

        const nonInitialStates = stateNames.filter(name => name !== this.initialState);
        if (nonInitialStates.length <= 0) return;

        const stateConnections = new Map();
        for (const state of stateNames) {
            stateConnections.set(state, { in: 0, out: 0 });
        }

        for (const transition of this.transitions) {
            stateConnections.get(transition.from).out += 1;
            stateConnections.get(transition.to).in += 1;
        }

        const stateImportance = new Map();
        for (const [state, connections] of stateConnections.entries()) {
            stateImportance.set(state, connections.in + connections.out);
        }

        const pathLengths = new Map();
        for (const state of stateNames) {
            pathLengths.set(state, 0);
        }

        const calculatePathLengths = (state, length) => {
            const currentLength = pathLengths.get(state);
            if (length > currentLength) {
                pathLengths.set(state, length);
                for (const transition of this.transitions) {
                    if (transition.from === state) {
                        calculatePathLengths(transition.to, length + 1);
                    }
                }
            }
        };

        if (this.initialState) {
            calculatePathLengths(this.initialState, 0);
        }

        const directTransitionsFromInitial = new Set();
        if (this.initialState) {
            for (const transition of this.transitions) {
                if (transition.from === this.initialState) {
                    directTransitionsFromInitial.add(transition.to);
                }
            }
        }

        const maxLevel = Math.max(...Array.from(pathLengths.values()));
        const statesByLevel = Array.from({ length: maxLevel + 1 }, () => []);

        for (const state of nonInitialStates) {
            const level = pathLengths.get(state);
            statesByLevel[level].push(state);
        }

        const baseRadius = MIN_STATE_DISTANCE * 2;
        const initialPos = this.initialState ? this.states.get(this.initialState).position.clone() : new THREE.Vector2(0, 0);

        const preferredAngles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI];

        for (let level = 0; level < statesByLevel.length; level++) {
            const states = statesByLevel[level];
            if (states.length === 0) continue;

            const radius = baseRadius * (level + 1);
            const angleStep = Math.min(2 * Math.PI / states.length, Math.PI / 4);

            states.sort((a, b) => {
                const aFromInitial = directTransitionsFromInitial.has(a) ? 1 : 0;
                const bFromInitial = directTransitionsFromInitial.has(b) ? 1 : 0;
                if (aFromInitial !== bFromInitial) return bFromInitial - aFromInitial;

                const aFinal = this.states.get(a).isFinal ? 1 : 0;
                const bFinal = this.states.get(b).isFinal ? 1 : 0;
                if (aFinal !== bFinal) return aFinal - bFinal;

                return stateImportance.get(b) - stateImportance.get(a);
            });

            let usedAngles = new Set();
            let remainingStates = [...states];
            let placedStates = [];

            if (level === 1) {
                const directStates = states.filter(s => directTransitionsFromInitial.has(s));

                for (let i = 0; i < directStates.length; i++) {
                    const state = directStates[i];
                    const angleIndex = i % preferredAngles.length;
                    const angle = preferredAngles[angleIndex];

                    this.states.get(state).position.set(
                        initialPos.x + radius * Math.cos(angle),
                        initialPos.y + radius * Math.sin(angle),
                    );

                    usedAngles.add(angle);
                    placedStates.push(state);
                    remainingStates = remainingStates.filter(s => s !== state);
                }
            }

            if (remainingStates.length > 0) {
                const startAngle = -Math.PI * 0.75;
                const endAngle = Math.PI * 0.75;
                const totalAngle = endAngle - startAngle;

                for (let i = 0; i < remainingStates.length; i++) {
                    const state = remainingStates[i];
                    const ratio = remainingStates.length > 1 ? i / (remainingStates.length - 1) : 0.5;
                    const angle = startAngle + ratio * totalAngle;

                    const radiusVariation = MIN_STATE_DISTANCE * 0.25 * (Math.random() - 0.5);

                    this.states.get(state).position.set(
                        initialPos.x + (radius + radiusVariation) * Math.cos(angle),
                        initialPos.y + (radius + radiusVariation) * Math.sin(angle),
                    );
                }
            }
        }

        this.preventOverlap();
        this.preventInitialStateOverlap();
    }

    preventInitialStateOverlap() {
        if (!this.initialState) return;

        const initialStatePos = this.states.get(this.initialState).position;
        const initialRadius = this.states.get(this.initialState).isFinal
            ? FINAL_STATE_OUTER_RADIUS : STATE_RADIUS;

        for (const transition of this.transitions) {
            if (transition.from === this.initialState || transition.to === this.initialState) {
                continue;
            }

            const fromPos = this.states.get(transition.from).position;
            const toPos = this.states.get(transition.to).position;

            const direction = toPos.clone().sub(fromPos).normalize();
            const lineLength = fromPos.distanceTo(toPos);
            const t = Math.max(0, Math.min(1, initialStatePos.clone().sub(fromPos).dot(direction) / lineLength));
            const projectionPoint = fromPos.clone().add(direction.clone().multiplyScalar(t * lineLength));
            const distance = initialStatePos.distanceTo(projectionPoint);

            if (distance < initialRadius * 1.5 && t > 0 && t < 1) {
                transition.needsExtraCurve = true;
                const perpFactor = initialStatePos.y > projectionPoint.y ? 1 : -1;
                transition.curveFactor = perpFactor;
            }
        }
    }

    centerStatesVertically() {
        let minY = Infinity;
        let maxY = -Infinity;

        for (const [name, state] of this.states) {
            minY = Math.min(minY, state.position.y);
            maxY = Math.max(maxY, state.position.y);
        }

        const centerY = (minY + maxY) / 2;
        const offsetY = -centerY;

        for (const [name, state] of this.states) {
            state.position.y += offsetY;
        }
    }

    preventOverlap() {
        const stateNames = Array.from(this.states.keys());
        let iterations = 0;
        const maxIterations = 100;

        let hasOverlap = true;
        while (hasOverlap && iterations < maxIterations) {
            hasOverlap = false;
            iterations++;

            for (let i = 0; i < stateNames.length; i++) {
                const stateA = this.states.get(stateNames[i]);

                for (let j = i + 1; j < stateNames.length; j++) {
                    const stateB = this.states.get(stateNames[j]);

                    const distance = stateA.position.distanceTo(stateB.position);
                    const minDistance = MIN_STATE_DISTANCE;

                    if (distance < minDistance) {
                        hasOverlap = true;
                        const direction = new THREE.Vector2()
                            .subVectors(stateB.position, stateA.position)
                            .normalize();

                        const moveDistance = (minDistance - distance) / 2;

                        stateA.position.sub(direction.clone().multiplyScalar(moveDistance));
                        stateB.position.add(direction.clone().multiplyScalar(moveDistance));
                    }
                }
            }
        }

        this.centerStates();
    }

    centerStates() {
        let centerX = 0;
        let centerY = 0;
        const stateEntries = Array.from(this.states.entries());

        stateEntries.forEach(([name, state]) => {
            centerX += state.position.x;
            centerY += state.position.y;
        });

        centerX /= stateEntries.length;
        centerY /= stateEntries.length;

        const offsetX = -centerX;
        const offsetY = -centerY;

        stateEntries.forEach(([name, state]) => {
            if (!state.isInitial) {
                state.position.x += offsetX;
                state.position.y += offsetY;
            }
        });
    }

    draw() {
        while (scene.children.length > 0) scene.remove(scene.children[0]);

        for (const [name, state] of this.states) {
            this.drawState(name, state);
        }

        for (const transition of this.transitions) {
            this.drawTransition(transition);
        }

        for (const [stateName, symbols] of this.selfLoops) {
            this.drawSelfLoops(stateName, symbols);
        }
    }

    drawSelfLoops(stateName, symbols) {
        const state = this.states.get(stateName);
        const position = state.position;
        const isFinal = state.isFinal;

        symbols.sort();
        const symbolsStr = symbols.join(',');

        const radiusToUse = isFinal ? FINAL_STATE_OUTER_RADIUS : STATE_RADIUS;

        const radius = radiusToUse * 1.5;
        const curve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(position.x, position.y + radiusToUse, 0),
            new THREE.Vector3(position.x + radius, position.y + radius, 0),
            new THREE.Vector3(position.x - radius, position.y + radius, 0),
            new THREE.Vector3(position.x, position.y + radiusToUse, 0)
        );

        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const arrowHead = new THREE.ConeGeometry(8, 16, 8);
        const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const arrow = new THREE.Mesh(arrowHead, arrowMaterial);

        const lastPoint = points[points.length - 2];
        const endPoint = points[points.length - 1];

        arrow.position.copy(endPoint);

        const direction = new THREE.Vector3(
            endPoint.x - lastPoint.x,
            endPoint.y - lastPoint.y,
            0
        ).normalize();

        arrow.lookAt(new THREE.Vector3(
            endPoint.x + direction.x,
            endPoint.y + direction.y,
            0
        ));
        arrow.rotateX(Math.PI / 2);

        scene.add(arrow);

        this.drawLabel(symbolsStr, position.x, position.y + radius + 20);
    }

    drawState(name, state) {
        const circleGeometry = new THREE.CircleGeometry(STATE_RADIUS, 32);
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5
        });
        const circle = new THREE.Mesh(circleGeometry, circleMaterial);
        circle.position.set(state.position.x, state.position.y, 0);
        scene.add(circle);

        const borderGeometry = new THREE.RingGeometry(STATE_RADIUS - 1, STATE_RADIUS, 32);
        const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.set(state.position.x, state.position.y, 0.1);
        scene.add(border);

        if (state.isFinal) {
            const fillGeometry = new THREE.RingGeometry(STATE_RADIUS, FINAL_STATE_OUTER_RADIUS - 1, 32);
            const fillMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            });
            const fill = new THREE.Mesh(fillGeometry, fillMaterial);
            fill.position.set(state.position.x, state.position.y, 0.15);
            scene.add(fill);

            const outerGeometry = new THREE.RingGeometry(FINAL_STATE_OUTER_RADIUS - 1, FINAL_STATE_OUTER_RADIUS, 32);
            const outerMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
            const outer = new THREE.Mesh(outerGeometry, outerMaterial);
            outer.position.set(state.position.x, state.position.y, 0.2);
            scene.add(outer);
        }

        if (state.isInitial) {
            this.drawInitialArrow(state);
        }

        this.drawLabel(name, state.position.x, state.position.y);
    }

    drawTransition({ from, to, symbol }) {
        const fromState = this.states.get(from);
        const toState = this.states.get(to);
        const fromPosition = fromState.position;
        const toPosition = toState.position;
        const isFinalFrom = fromState.isFinal;
        const isFinalTo = toState.isFinal;

        const fromRadius = isFinalFrom ? FINAL_STATE_OUTER_RADIUS : STATE_RADIUS;
        const toRadius = isFinalTo ? FINAL_STATE_OUTER_RADIUS : STATE_RADIUS;

        const collidingState = this.findCollidingState(fromPosition, toPosition);

        if (collidingState) {
            this.drawCurvedArrow(fromPosition, toPosition, symbol, collidingState, fromRadius, toRadius);
        } else {
            this.drawArrow(fromPosition, toPosition, symbol, fromRadius, toRadius);
        }
    }

    findCollidingState(from, to) {
        const direction = to.clone().sub(from);
        const length = direction.length();
        direction.normalize();

        for (const [name, state] of this.states) {
            if (state.position.equals(from) || state.position.equals(to)) {
                continue;
            }

            const statePos = state.position;
            const t = Math.max(0, Math.min(1, statePos.clone().sub(from).dot(direction) / length));
            const projection = from.clone().add(direction.clone().multiplyScalar(t * length));
            const distance = statePos.distanceTo(projection);

            if (distance < STATE_RADIUS * 1.2 && t > 0 && t < 1) {
                return state;
            }
        }

        return null;
    }

    drawCurvedArrow(from, to, symbol, collidingState, fromRadius, toRadius) {
        const direction = to.clone().sub(from).normalize();
        const collidingDirection = collidingState.position.clone().sub(from).normalize();
        const perpFactor = collidingDirection.dot(direction) > 0 ? -1 : 1;
        const perpendicular = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(perpFactor * 50);

        const start = from.clone().add(direction.clone().multiplyScalar(fromRadius));
        const end = to.clone().sub(direction.clone().multiplyScalar(toRadius));

        const controlPoint = start.clone()
            .add(end)
            .multiplyScalar(0.5)
            .add(perpendicular);

        const curve = new THREE.QuadraticBezierCurve(
            new THREE.Vector3(start.x, start.y, 0),
            new THREE.Vector3(controlPoint.x, controlPoint.y, 0),
            new THREE.Vector3(end.x, end.y, 0)
        );

        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const arrowHead = new THREE.ConeGeometry(5, 12, 8);
        const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const arrow = new THREE.Mesh(arrowHead, arrowMaterial);

        arrow.position.set(end.x, end.y, 0);

        const lastPoint = points[points.length - 2];
        const direction2 = new THREE.Vector3(
            end.x - lastPoint.x,
            end.y - lastPoint.y,
            0
        ).normalize();

        arrow.lookAt(new THREE.Vector3(
            end.x + direction2.x,
            end.y + direction2.y,
            0
        ));
        arrow.rotateX(Math.PI / 2);

        scene.add(arrow);

        const labelPos = controlPoint.clone();
        this.drawLabel(symbol, labelPos.x, labelPos.y);
    }

    drawInitialArrow(state) {
        const width = 20;
        const height = 30;
        const radiusToUse = state.isFinal ? FINAL_STATE_OUTER_RADIUS : STATE_RADIUS;
        const posX = state.position.x - radiusToUse - width;
        const posY = state.position.y;

        const triangleShape = new THREE.Shape();
        triangleShape.moveTo(0, height / 2);
        triangleShape.lineTo(width, 0);
        triangleShape.lineTo(0, -height / 2);
        triangleShape.lineTo(0, height / 2);

        const geometry = new THREE.ShapeGeometry(triangleShape);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const triangle = new THREE.Mesh(geometry, material);
        triangle.position.set(posX, posY, 0);

        const lineStart = new THREE.Vector2(posX - 30, posY);
        const lineEnd = new THREE.Vector2(state.position.x - radiusToUse, posY);

        const points = [
            new THREE.Vector3(lineStart.x, lineStart.y, -0.1),
            new THREE.Vector3(lineEnd.x, lineEnd.y, -0.1)
        ];

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const line = new THREE.Line(lineGeometry, lineMaterial);

        scene.add(line);
        scene.add(triangle);
    }

    drawArrow(from, to, symbol, fromRadius, toRadius) {
        const direction = to.clone().sub(from).normalize();
        const perpendicular = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(20);

        const start = from.clone().add(direction.clone().multiplyScalar(fromRadius));
        const end = to.clone().sub(direction.clone().multiplyScalar(toRadius));

        const controlPoint = start.clone()
            .add(end)
            .multiplyScalar(0.5)
            .add(perpendicular);

        const curve = new THREE.QuadraticBezierCurve(
            new THREE.Vector3(start.x, start.y, 0),
            new THREE.Vector3(controlPoint.x, controlPoint.y, 0),
            new THREE.Vector3(end.x, end.y, 0)
        );

        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const arrowHead = new THREE.ConeGeometry(5, 12, 8);
        const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const arrow = new THREE.Mesh(arrowHead, arrowMaterial);

        arrow.position.set(end.x, end.y, 0);

        const lastPoint = points[points.length - 2];
        const direction2 = new THREE.Vector3(
            end.x - lastPoint.x,
            end.y - lastPoint.y,
            0
        ).normalize();

        arrow.lookAt(new THREE.Vector3(
            end.x + direction2.x,
            end.y + direction2.y,
            0
        ));
        arrow.rotateX(Math.PI / 2);

        scene.add(arrow);

        const labelPos = controlPoint.clone();
        this.drawLabel(symbol, labelPos.x, labelPos.y);
    }

    drawLabel(text, x, y) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = 256;
        canvas.height = 128;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'black';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);

        sprite.scale.set(STATE_RADIUS * 2, STATE_RADIUS, 1);
        sprite.position.set(x, y, 1);

        scene.add(sprite);
    }
}

const input = document.getElementById('fileInput');
input.addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = JSON.parse(event.target.result);
        const afd = new AFD();

        data.states.forEach(s => afd.addState(s, s === data.startState, data.finalStates.includes(s)));
        data.transitions.forEach(t => afd.addTransition(t.from, t.to, t.symbol));

        afd.layout();
        afd.draw();
    };
    reader.readAsText(e.target.files[0]);
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();