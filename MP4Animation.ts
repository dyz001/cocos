export class MP4Animation{
    protected video: HTMLVideoElement;
    protected canvas: HTMLCanvasElement;
    protected webgl: WebGLRenderingContext;
    protected video_url: string;
    protected texture: WebGLTexture;
    protected program: WebGLProgram;
    protected textureLocation: null;
    protected is_init: boolean;
    protected is_init_gl: boolean;
    protected onPlay: Function;
    protected first_time_update: boolean;
    protected position_buffer:WebGLBuffer;
    protected texcoord_buffer: WebGLBuffer;
    protected position_location: number;
    protected texcoord_location: number;
    protected update_canvas_call: FrameRequestCallback;
    protected play_end: boolean;
    protected can_play: boolean;
    protected vertex_shader: string;
    protected fragment_shader: string;
    protected vs: WebGLShader;
    protected fs: WebGLShader;

    protected onFinishCallBack: Function;
    protected onPlayCallBack: Function;
    protected onError: Function;

    constructor(){
        this.vertex_shader = `attribute vec2 a_position;
        attribute vec2 a_texCoord;
        uniform vec2 u_resolution;
        varying vec2 v_texCoord;
        
        void main() {
           // convert the rectangle from pixels to 0.0 to 1.0
           vec2 zeroToOne = a_position / u_resolution;
        
           // convert from 0->1 to 0->2
           vec2 zeroToTwo = zeroToOne * 2.0;
        
           // convert from 0->2 to -1->+1 (clipspace)
           vec2 clipSpace = zeroToTwo - 1.0;
        
           gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        
           // pass the texCoord to the fragment shader
           // The GPU will interpolate this value between points.
           v_texCoord = a_texCoord;
        }`;
        this.fragment_shader = `precision mediump float;
        uniform sampler2D u_image;
        
        // the texCoords passed in from the vertex shader.
        varying vec2 v_texCoord;
        
        void main() {
            vec4 color = texture2D(u_image, v_texCoord);
            if(v_texCoord.x < 0.5){
                vec4 color2 = texture2D(u_image, vec2(v_texCoord.x + 0.5, v_texCoord.y));
                color.a = color2.r;
            }
            gl_FragColor = color;
        }`;
        this.init();
    }

    protected init(){
        this.video = document.createElement("video");
        this.canvas = document.createElement("canvas");
        this.webgl = this.canvas.getContext("webgl");
        if(!this.webgl){
            throw "gl create failed";
        }
        this.webgl.createBuffer()
        this.video.playsInline = true;
        //@ts-ignore
        this.video.type = "video/mp4";
        this.video.muted = true;
        this.onPlay = this.canPlay.bind(this);
        this.update_canvas_call = this.updateCanvas.bind(this);
        //@ts-ignore
        this.video.addEventListener("canplay", this.onPlay);
        this.video.addEventListener("timeupdate", ()=>{
            if(!this.first_time_update && this.can_play){
                this.first_time_update = true;
                this.play_end = false;
                console.log("video width:" + this.video.videoWidth)
                this.canvas.width = this.video.videoWidth / 2;
                this.canvas.height = this.video.videoHeight;
                //@ts-ignore
                this.canvas.style.width = this.canvas.width + "px";
                //@ts-ignore
                this.canvas.style.height = this.canvas.height + "px";
                
                if(!this.is_init_gl){
                    this.initGL();
                }
                this.updateCanvas();
                this.onPlayCallBack && this.onPlayCallBack();
                this.first_time_update = true;
            }
        });
        this.video.addEventListener("ended", ()=>{
            this.play_end = true;
            this.first_time_update = false;
            this.onFinishCallBack && this.onFinishCallBack();
        });
        this.video.addEventListener("error", ()=>{
            console.error("video error");
            this.onError && this.onError();
        });
        this.is_init = true;
    }

    protected canPlay(){
        let isVideoPlaying = video => !!(video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2);
        if(isVideoPlaying(this.video)) return;
        this.can_play = true;
        this.video.play();
    }

    public play(src: string){
        if(!this.is_init) return;
        this.can_play = false;
        this.play_end = true;
        this.first_time_update = false;
        this.video.src = src;
    }

    protected setRectangle(x, y, width, height){
        let x1 = x;
        let x2 = x + width;
        let y1 = y;
        let y2 = y + height;
        this.webgl.bufferData(this.webgl.ARRAY_BUFFER, new Float32Array([
           x1, y1,
           x2, y1,
           x1, y2,
           x1, y2,
           x2, y1,
           x2, y2,
        ]), this.webgl.STATIC_DRAW);
    }

    protected initGL(){
        if(!this.canvas){
            console.error("canvas not created");
            return;
        }
        this.webgl = this.canvas.getContext("webgl");
        if(!this.webgl){
            console.error("create web gl failed");
            return;
        }
        let gl = this.webgl;
        this.fs = this.loadShader(this.fragment_shader, this.webgl.FRAGMENT_SHADER, null);
        this.vs = this.loadShader(this.vertex_shader, this.webgl.VERTEX_SHADER, null);
        if(!this.fs || !this.vs){
            console.error("shader create failed");
            return;
        }
        this.program = this.createProgram([this.fs, this.vs]);
        if(!this.program){
            console.error("program create failed");
            return;
        }
        // Tell it to use our program (pair of shaders)
        let program = this.program;
        this.webgl.useProgram(program);
        this.position_location = gl.getAttribLocation(program, "a_position");
        this.texcoord_location = gl.getAttribLocation(program, "a_texCoord");

        this.initBuffers();
        // Set the parameters so we can render any size image.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        // Draw the rectangle.
        let primitiveType = gl.TRIANGLES;
        let offset = 0;
        let count = 6;
        gl.drawArrays(primitiveType, offset, count);
        this.is_init_gl = true;
    }

    protected initBuffers(){
        if(!this.webgl){
            console.error("no webgl");
            return false;
        }
        var texcoordLocation = this.texcoord_location;
        let gl = this.webgl
        var positionBuffer = gl.createBuffer();
        this.position_buffer = positionBuffer;

        // provide texture coordinates for the rectangle.
        var texcoordBuffer = gl.createBuffer();
        this.texcoord_buffer = texcoordBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0,  0.0,
            0.5,  0.0,
            0.0,  1.0,
            0.0,  1.0,
            0.5,  0.0,
            0.5,  1.0,
        ]), gl.STATIC_DRAW);


        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Create a texture.
        this.texture = gl.createTexture();
        let texture = this.texture;
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Turn on the texcoord attribute
        gl.enableVertexAttribArray(texcoordLocation);
        // bind the texcoord buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        // Tell the texcoord attribute how to get data out of texcoordBuffer (ARRAY_BUFFER)
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            texcoordLocation, size, type, normalize, stride, offset);
        return true;
    }

    protected updateCanvas(){
        if(!this.is_init || !this.is_init_gl) return;
        if(this.play_end){
            return;
        }
        let gl = this.webgl;
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
        gl.clearDepth(1.0); // Clear everything
        gl.enable(gl.DEPTH_TEST); // Enable depth testing
        gl.depthFunc(gl.LEQUAL); // Near things obscure far things

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.position_buffer);
        // Set a rectangle the same size as the video.
        this.setRectangle(0, 0, gl.canvas.width, gl.canvas.height);
        var resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");

        // Tell the shader to get the texture from texture unit 0
        gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
        // gl.uniform1i(this.textureLocation, 0);

        let positionLocation = this.position_location;
        let positionBuffer = this.position_buffer;

        // Turn on the position attribute
        gl.enableVertexAttribArray(positionLocation);
        // Bind the position buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            positionLocation, size, type, normalize, stride, offset);

        // Tell WebGL how to convert from clip space to pixels
        const level = 0;
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        // gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            internalFormat,
            srcFormat,
            srcType,
            this.video
        );
        // gl.generateMipmap(gl.TEXTURE_2D);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(this.update_canvas_call);
    }

    protected loadShader(shaderSource:string, shaderType:number, opt_errorCallback){
        if(!this.webgl) return;
        let gl = this.webgl;
        const errFn = opt_errorCallback || console.error;
        // Create the shader object
        const shader = gl.createShader(shaderType);
    
        // Load the shader source
        gl.shaderSource(shader, shaderSource);
    
        // Compile the shader
        gl.compileShader(shader);
    
        // Check the compile status
        const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!compiled) {
          // Something went wrong during compilation; get the error
          const lastError = gl.getShaderInfoLog(shader);
          errFn('*** Error compiling shader \'' + shader + '\':' + lastError + `\n` + shaderSource.split('\n').map((l,i) => `${i + 1}: ${l}`).join('\n'));
          gl.deleteShader(shader);
          return null;
        }
    
        return shader;
    }

    protected createProgram(shaders, opt_attribs=null, opt_locations=null, opt_errorCallback=null){
        const errFn = opt_errorCallback || console.error;
        if(!this.webgl) return;
        let gl = this.webgl;
        const program = gl.createProgram();
        shaders.forEach(function(shader) {
        gl.attachShader(program, shader);
        });
        if (opt_attribs) {
            opt_attribs.forEach(function(attrib, ndx) {
                gl.bindAttribLocation(
                    program,
                    opt_locations ? opt_locations[ndx] : ndx,
                    attrib);
            });
        }
        gl.linkProgram(program);

        // Check the link status
        const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!linked) {
            // something went wrong with the link
            const lastError = gl.getProgramInfoLog(program);
            errFn('Error in program linking:' + lastError);
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    public get loop(): boolean{
        if(!this.is_init) return false;
        return this.video.loop;
    }

    public set loop(val: boolean){
        if(!this.is_init) return;
        this.video.loop = val;
    }

    public getCanvas():HTMLCanvasElement{
        return this.canvas;
    }

    public getVideo():HTMLVideoElement{
        return this.video;
    }

    public isPlaying(): boolean{
        return !this.play_end;
    }

    public setPlayCallBack(playCb: Function){
        this.onPlayCallBack = playCb;
    }

    public setFinishCallBack(finishCb: Function){
        this.onFinishCallBack = finishCb;
    }

    public setErrorCallBack(errorCb: Function){
        this.onError = errorCb;
    }

    public destroy(){
        if(this.position_buffer){
            this.webgl.deleteBuffer(this.position_buffer);
        }
        if(this.texture){
            this.webgl.deleteTexture(this.texture);
        }
        if(this.texcoord_buffer){
            this.webgl.deleteBuffer(this.texcoord_buffer);
        }
        this.program && this.webgl.deleteProgram(this.program);
        this.fs && this.webgl.deleteShader(this.fs);
        this.vs && this.webgl.deleteShader(this.vs);
        this.webgl = null;
        this.video = null;
        this.canvas = null;
        this.is_init = false;
        this.is_init_gl = false;
        this.can_play = false;
        this.play_end = true;
        this.first_time_update = false;
    }

}


