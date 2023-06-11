import { _decorator, Component, Node } from 'cc';
import { MP4Animation } from './MP4Animation';
import { Sprite } from 'cc';
import { UITransform } from 'cc';
import { SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VideoAnimation')
export class VideoAnimation extends Sprite {
    protected mp4Anim: MP4Animation;
    protected transform: UITransform;
    protected can_play: boolean;
    start() {
        this.mp4Anim = new MP4Animation();
        this.mp4Anim.setFinishCallBack(this.onPlayEnd.bind(this));
        this.mp4Anim.setPlayCallBack(this.onPlayBegin.bind(this));
        this.transform = this.node.getComponent(UITransform);
        if(!this.transform){
            console.error("no transform found");
        }
        this.can_play = false;
    }

    public get loop():boolean{
        let video = this.mp4Anim.getVideo();
        if(video){
            return video.loop;
        }
        return false;
    }

    public set loop(val: boolean){
        let video = this.mp4Anim.getVideo();
        if(video){
            video.loop = val;
        }
    }

    play(url: string){
        if(!this.mp4Anim) return;
        console.log("play url:" + url);
        this.mp4Anim.play(url);
        this.node.active = true;
        let canvas = this.mp4Anim.getCanvas();
        this.transform.width = canvas.width;
        this.transform.height = canvas.height;
    }

    onError(){
        this.node.active = false;
        this.can_play = false;
    }

    onPlayBegin(){
        console.log("play begin " + this.node.active);
        this.can_play = true;
    }

    onPlayEnd(){
        this.can_play = false;
        this.node.active = false;
    }

    update(deltaTime: number) {
        if(!this.can_play) return;
        this.spriteFrame = SpriteFrame.createWithImage(this.mp4Anim.getCanvas());
    }
}


