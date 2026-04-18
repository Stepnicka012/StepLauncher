import { mat4 } from "./mat4.js";

export class HeadModel {
    /**
    * @param {HTMLCanvasElement} canvas
    * @param {string} skinUrl
    * @param {object} options Opciones para control de animación y rotación inicial
    */
    constructor(canvas, skinUrl, options = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl");
        if (!this.gl) {
            alert("WebGL no es soportado en este navegador.");
            return;
        }
        
        this.options = {
            rotationInitial: {
                x: (options.rotation?.x ?? 0) * (Math.PI / 180),
                y: (options.rotation?.y ?? 0) * (Math.PI / 180),
            },
            animationEnabled: options.animationEnabled ?? true,
            swayIntensity: options.swayIntensity ?? 0.1,
            swaySpeed: options.swaySpeed ?? 1.5,
        };
        
        // Estado de rotación
        this.rotationX = this.options.rotationInitial.x;
        this.rotationY = this.options.rotationInitial.y;
        this.targetRotationX = this.rotationX;
        this.targetRotationY = this.rotationY;
        
        this.isCursorOver = false;
        
        this._setupGeometry();
        this._setupShaders();
        this._loadTexture(skinUrl);
        
        this._bindEvents();
        
        this._lastTime = 0;
        requestAnimationFrame(this._render.bind(this));
    }
    
    _setupGeometry() {
        const gl = this.gl;
        const px = 1 / 64;
        
        // UV coords para la cabeza base
        const UVBase = {
            right: [0 / 64, 8 / 64, 7 / 64 + px, 15 / 64 + px],
            left: [8 / 64, 8 / 64, 0 / 64 + px, 15 / 64 + px],
            top: [8 / 64, 0 / 64, 15 / 64 + px, 8 / 64 + px],
            bottom: [16 / 64, 0 / 64, 23 / 64 + px, 7 / 64 + px],
            front: [8 / 64, 8 / 64, 15 / 64 + px, 15 / 64 + px],
            back: [24 / 64, 8 / 64, 31 / 64 + px, 15 / 64 + px],
        };
        
        // UV coords para la segunda capa (overlay)
        const UVOverlay = {
            right: [32 / 64, 8 / 64, 39 / 64 + px, 15 / 64 + px],
            left: [40 / 64, 8 / 64, 32 / 64 + px, 15 / 64 + px],
            top: [40 / 64, 0 / 64, 47 / 64 + px, 8 / 64 + px],
            bottom: [48 / 64, 0 / 64, 55 / 64 + px, 7 / 64 + px],
            front: [40 / 64, 8 / 64, 47 / 64 + px, 15 / 64 + px],
            back: [56 / 64, 8 / 64, 63 / 64 + px, 15 / 64 + px],
        };
        
        const pushFace = (arr, positions, uv) => {
            const [u0, v0, u1, v1] = uv;
            const invV0 = 1.0 - v0;
            const invV1 = 1.0 - v1;
            const [p0, p1, p2, p3] = positions;
            arr.push(
                ...p0,
                u0,
                invV1,
                ...p1,
                u1,
                invV1,
                ...p2,
                u1,
                invV0,
                ...p3,
                u0,
                invV0
            );
        };
        
        // Vertices base (cabeza)
        const verticesBase = [];
        
        pushFace(
            verticesBase,
            [
                [4, -4, -4],
                [4, -4, 4],
                [4, 4, 4],
                [4, 4, -4],
            ],
            UVBase.right
        );
        pushFace(
            verticesBase,
            [
                [-4, -4, 4],
                [-4, -4, -4],
                [-4, 4, -4],
                [-4, 4, 4],
            ],
            UVBase.left
        );
        pushFace(
            verticesBase,
            [
                [-4, 4, 4],
                [4, 4, 4],
                [4, 4, -4],
                [-4, 4, -4],
            ],
            UVBase.top
        );
        pushFace(
            verticesBase,
            [
                [-4, -4, -4],
                [4, -4, -4],
                [4, -4, 4],
                [-4, -4, 4],
            ],
            UVBase.bottom
        );
        pushFace(
            verticesBase,
            [
                [-4, -4, 4],
                [4, -4, 4],
                [4, 4, 4],
                [-4, 4, 4],
            ],
            UVBase.front
        );
        pushFace(
            verticesBase,
            [
                [4, -4, -4],
                [-4, -4, -4],
                [-4, 4, -4],
                [4, 4, -4],
            ],
            UVBase.back
        );
        
        const overlayScale = 1.1;
        const scalePos = (p) => p.map((v) => v * overlayScale);
        const verticesOverlay = [];
        
        pushFace(
            verticesOverlay,
            [
                scalePos([4, -4, -4]),
                scalePos([4, -4, 4]),
                scalePos([4, 4, 4]),
                scalePos([4, 4, -4]),
            ],
            UVOverlay.right
        );
        pushFace(
            verticesOverlay,
            [
                scalePos([-4, -4, 4]),
                scalePos([-4, -4, -4]),
                scalePos([-4, 4, -4]),
                scalePos([-4, 4, 4]),
            ],
            UVOverlay.left
        );
        pushFace(
            verticesOverlay,
            [
                scalePos([-4, 4, 4]),
                scalePos([4, 4, 4]),
                scalePos([4, 4, -4]),
                scalePos([-4, 4, -4]),
            ],
            UVOverlay.top
        );
        pushFace(
            verticesOverlay,
            [
                scalePos([-4, -4, -4]),
                scalePos([4, -4, -4]),
                scalePos([4, -4, 4]),
                scalePos([-4, -4, 4]),
            ],
            UVOverlay.bottom
        );
        pushFace(
            verticesOverlay,
            [
                scalePos([-4, -4, 4]),
                scalePos([4, -4, 4]),
                scalePos([4, 4, 4]),
                scalePos([-4, 4, 4]),
            ],
            UVOverlay.front
        );
        pushFace(
            verticesOverlay,
            [
                scalePos([4, -4, -4]),
                scalePos([-4, -4, -4]),
                scalePos([-4, 4, -4]),
                scalePos([4, 4, -4]),
            ],
            UVOverlay.back
        );
        
        const vertices = [...verticesBase, ...verticesOverlay];
        
        const indicesBase = new Uint16Array([
            0,
            1,
            2,
            0,
            2,
            3, // right
            4,
            5,
            6,
            4,
            6,
            7, // left
            8,
            9,
            10,
            8,
            10,
            11, // top
            12,
            13,
            14,
            12,
            14,
            15, // bottom
            16,
            17,
            18,
            16,
            18,
            19, // front
            20,
            21,
            22,
            20,
            22,
            23, // back
        ]);
        const indicesOverlay = new Uint16Array(
            Array.from(indicesBase).map((i) => i + 24)
        );
        const indices = new Uint16Array(indicesBase.length + indicesOverlay.length);
        indices.set(indicesBase);
        indices.set(indicesOverlay, indicesBase.length);
        
        // Buffers
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        
        this.numIndices = indices.length;
    }
    
    _setupShaders() {
        const gl = this.gl;
        const vsSource = `
        attribute vec3 aPosition;
        attribute vec2 aTexCoord;
        varying highp vec2 vTexCoord;
        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;
        void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
        vTexCoord = aTexCoord;
        }
        `;
        
        const fsSource = `
        varying highp vec2 vTexCoord;
        uniform sampler2D uSampler;
        void main(void) {
        gl_FragColor = texture2D(uSampler, vTexCoord);
        }
        `;
        
        const compileShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                alert("Error al compilar shader: " + gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        };
        
        const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);
        
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);
        gl.linkProgram(this.shaderProgram);
        
        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            alert(
                "No se pudo inicializar el programa de shaders: " +
                gl.getProgramInfoLog(this.shaderProgram)
            );
            return;
        }
        
        this.programInfo = {
            attribLocations: {
                position: gl.getAttribLocation(this.shaderProgram, "aPosition"),
                texCoord: gl.getAttribLocation(this.shaderProgram, "aTexCoord"),
            },
            uniformLocations: {
                projectionMatrix: gl.getUniformLocation(
                    this.shaderProgram,
                    "uProjectionMatrix"
                ),
                modelViewMatrix: gl.getUniformLocation(
                    this.shaderProgram,
                    "uModelViewMatrix"
                ),
                sampler: gl.getUniformLocation(this.shaderProgram, "uSampler"),
            },
        };
        
        this.projectionMatrix = mat4.create();
        this.modelViewMatrix = mat4.create();
        
        mat4.perspective(
            this.projectionMatrix,
            Math.PI / 4,
            this.canvas.width / this.canvas.height,
            0.1,
            100
        );
    }
    
    _loadTexture(url) {
        const gl = this.gl;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        };
        img.onerror = () => alert("No se pudo cargar la skin: " + url);
        img.src = url;
    }
    
    _bindEvents() {
        window.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Opcional: verifica si el cursor está dentro del canvas para algo
            const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
            
            if (inside) {
                this.isCursorOver = true;
                // Actualiza rotaciones según posición
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const maxRotation = Math.PI / 8; // +/- 22.5 grados
                
                this.targetRotationY = ((x - centerX) / centerX) * maxRotation;
                this.targetRotationX = ((y - centerY) / centerY) * maxRotation;
            } else {
                this.isCursorOver = false;
                this.targetRotationX = this.options.rotationInitial.x;
                this.targetRotationY = this.options.rotationInitial.y;
            }
        });
        this.canvas.addEventListener("mouseenter", () => {
            this.isCursorOver = true;
            this.targetRotationX = 0;
            this.targetRotationY = 0;
        });
        
        this.canvas.addEventListener("mouseleave", () => {
            this.isCursorOver = false;
            // Cuando el cursor sale, vuelve a la rotación inicial + sway
            this.targetRotationX = this.options.rotationInitial.x;
            this.targetRotationY = this.options.rotationInitial.y;
        });
    }
    
    _render(time = 0) {
        const gl = this.gl;
        this._lastTime = time;
        
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.1, 0.1, 0.1, 1);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // Si la animación está habilitada y el cursor NO está sobre el canvas,
        // aplicar sway oscilante (movimiento suave) en X y Y
        if (this.options.animationEnabled && !this.isCursorOver) {
            const swayX =
            Math.cos(time * 0.001 * this.options.swaySpeed * 1.3) *
            this.options.swayIntensity;
            const swayY =
            Math.sin(time * 0.001 * this.options.swaySpeed) *
            this.options.swayIntensity;
            
            this.targetRotationX = this.options.rotationInitial.x + swayX;
            this.targetRotationY = this.options.rotationInitial.y + swayY;
        }
        
        // Lerpear rotación para suavizar movimiento
        const lerp = (a, b, f) => a + (b - a) * f;
        const lerpSpeed = 0.1;
        this.rotationX = lerp(this.rotationX, this.targetRotationX, lerpSpeed);
        this.rotationY = lerp(this.rotationY, this.targetRotationY, lerpSpeed);
        
        // Reset matrices
        mat4.identity(this.modelViewMatrix);
        mat4.translate(this.modelViewMatrix, this.modelViewMatrix, [0, 0, -24]);
        mat4.rotate(
            this.modelViewMatrix,
            this.modelViewMatrix,
            this.rotationX,
            [1, 0, 0]
        );
        mat4.rotate(
            this.modelViewMatrix,
            this.modelViewMatrix,
            this.rotationY,
            [0, 1, 0]
        );
        
        gl.useProgram(this.shaderProgram);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.vertexAttribPointer(
            this.programInfo.attribLocations.position,
            3,
            gl.FLOAT,
            false,
            5 * 4,
            0
        );
        gl.enableVertexAttribArray(this.programInfo.attribLocations.position);
        
        gl.vertexAttribPointer(
            this.programInfo.attribLocations.texCoord,
            2,
            gl.FLOAT,
            false,
            5 * 4,
            3 * 4
        );
        gl.enableVertexAttribArray(this.programInfo.attribLocations.texCoord);
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        
        gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.projectionMatrix,
            false,
            this.projectionMatrix
        );
        gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.modelViewMatrix,
            false,
            this.modelViewMatrix
        );
        
        if (this.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        }
        
        gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_SHORT, 0);
        
        requestAnimationFrame(this._render.bind(this));
    }
}
