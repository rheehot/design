import UIElement, { EVENT } from "../../../util/UIElement";
import { POINTERSTART, MOVE, END, BIND, POINTERMOVE, PREVENT, KEYUP, IF, STOP, CLICK, KEY } from "../../../util/Event";
import { editor } from "../../../editor/editor";
import Dom from "../../../util/Dom";
import PathParser from "../../../editor/parse/PathParser";
import { Length } from "../../../editor/unit/Length";
import { recoverBezierLine, getBezierPointsLine } from "../../../util/functions/bezier"
import { SVGPolygonItem } from "../../../editor/items/layers/SVGPolygonItem";

export default class RectEditorView extends UIElement {

    initState() {
        return {
            isShow: false, 
            segments: [],
            mode: 'draw',
            $target: null,
            screenX: Length.px(0),
            screenY: Length.px(0),
            screenWidth: Length.px(0),
            screenHeight: Length.px(0),
            itemX: Length.px(0),
            itemY: Length.px(0),
            itemWidth: Length.px(0),
            itemHeight: Length.px(0),
            itemRX: Length.px(0),
            itemRY: Length.px(0),            
        }
    }

    get scale () {
        return editor.scale;
    }

    template() {
        return `<div class='rect-editor-view' tabIndex="-1" ref='$view' ></div>` 
    }

    isShow () {
        return this.state.isShow;
    }

    // svg 에는 키 이벤트를 줄 수 없어서 
    // document 전체에 걸어서 처리한다. 
    // 실행은 Polygon 에디터가 보일 때만 
    [KEYUP('document') + IF('isShow') + KEY('Escape') + KEY('Enter') + PREVENT] (e) {

        if (this.state.current) {
            this.refreshPolygonLayer();
        } else {    
            this.addPolygonLayer(this.getViewRect()); 
        }
        this.trigger('hidePolygonEditor');        
    }

    makePolygonLayer (pathRect) {
        var totalLength = this.refs.$view.$('polygon.object').el.getTotalLength()                
        var { points } = this.polygonGenerator.toPolygon(pathRect.x, pathRect.y, this.scale);
        var artboard = editor.selection.currentArtboard
        var layer; 
        if (artboard) {

            var x = pathRect.x / this.scale;
            var y = pathRect.y / this.scale;
            var width = pathRect.width / this.scale;
            var height = pathRect.height / this.scale; 

            layer = artboard.add(new SVGPolygonItem({
                width: Length.px(width),
                height: Length.px(height),
                points,
                totalLength
            }))

            layer.setScreenX(x);
            layer.setScreenY(y);
        }

        return layer; 
    }

    updatePolygonLayer () {
        var totalLength = this.refs.$view.$('polygon.object').el.getTotalLength()        
        var { points } = this.polygonGenerator.toPolygon(
            this.state.screenX.value * this.scale, 
            this.state.screenY.value * this.scale, 
            this.scale
        );

        this.emit('updatePolygonItem', {
            points,
            totalLength
        })
        this.emit('refreshPolygonLayer')
    }

    addPolygonLayer(pathRect) {
        this.changeMode('modify');
        // this.bindData('$view');


        var layer = this.makePolygonLayer(pathRect)
        if (layer) {
            editor.selection.select(layer);

            this.state.segments = [] 
            this.polygonParser.reset('')
            this.bindData('$view');

            this.emit('refreshAll')
            this.emit('refreshSelection');
        }

        // this.trigger('hidePathEditor');

    }

    changeMode (mode, obj) { 
        this.setState({
            mode,
            moveXY: null,
            ...obj
        }, false)    
    }

    isMode (mode) {
        return this.state.mode === mode; 
    }

    [EVENT('changeScale')] () {

        this.refresh();

    }

    refresh (obj) {

        if (obj && obj.points) {
            this.polygonParser.reset(obj.points)
            this.polygonParser.scale(this.scale, this.scale);
            this.polygonParser.translate(obj.screenX.value * this.scale, obj.screenY.value * this.scale)

            // points 문자열에서 변환된 point 는 segments 로 변경된다. 
            this.state.segments = this.polygonParser.convertGenerator();
        } else {
            this.state.segments = [] 
        }

        this.bindData('$view')

    }

    [EVENT('showPolygonEditor')] (mode = 'draw', obj = {}) {

        if (mode === 'move') {
            obj.current = null;
        } else {
            if (!obj.current) {
                obj.current = null; 
            }            
        }

        var newOptions = {
            ...obj,
            points: obj.points || ''
        }

        this.changeMode(mode, obj);
        this.refresh(newOptions);

        this.state.isShow = true; 
        this.$el.show();
        this.$el.focus();

        if (mode === 'star') {
            this.emit('showStarManager', {
                changeEvent: 'changeStarManager',
                count: this.state.starCount,
                radius: this.state.starInnerRadiusRate
            })
            this.emit('hidePolygonManager');
        } else {
            this.emit('showPolygonManager', { mode: this.state.mode });
            this.emit('hideStarManager');
        }
    }

    [EVENT('changeStarManager')] (count, radius) {

        this.state.starCount = count; 
        this.state.starInnerRadiusRate = radius; 

        this.refreshStar()

    }

    [EVENT('hidePolygonEditor')] () {
        this.polygonParser.reset('')
        this.setState(this.initState(), false)
        this.refs.$view.empty()        
        this.$el.hide();

        this.emit('hideStarManager');
        this.emit('hidePolygonManager');        
        this.emit('finishPolygonEdit')   
    }


    [EVENT('hideSubEditor')] () {
        // this.trigger('hidePolygonEditor');
    }

    [BIND('$view')] () {
        return {
            class: {
                'draw': this.state.mode === 'draw',
                'modify': this.state.mode === 'modify',
                'segment-move': this.state.mode === 'segment-move',
            },
            innerHTML: this.polygonGenerator.makeSVGPath()
        }
    }

    getXY ([x, y]) {
        return {x, y}
    }

    [CLICK('$view .split-path')] (e) {
        var parser = new PathParser(e.$delegateTarget.attr('d'));
        var clickPosition = {
            x: e.xy.x - this.state.rect.x, 
            y: e.xy.y - this.state.rect.y
        }; 

        var points = [
            this.getXY(parser.segments[0].values),
            this.getXY(parser.segments[1].values.slice(0, 2))
        ]

        var curve = recoverBezierLine(...points, 200)
        var t = curve(clickPosition.x, clickPosition.y);          


        this.polygonGenerator.setPointLine(getBezierPointsLine(points, t))

        this.changeMode('modify');
        this.bindData('$view');

        this.refreshPolygonLayer();

    }

    getViewRect () {
        var pathRect = this.refs.$view.$('polygon.object').rect()
        pathRect.x -= this.state.rect.x;
        pathRect.y -= this.state.rect.y;

        return pathRect;
    }

    refreshPolygonLayer () {
        this.updatePolygonLayer(this.getViewRect());
    }

    [POINTERMOVE('$view')] (e) {
        if (this.isMode('draw') && this.state.rect) {            
            this.state.moveXY = {
                x: e.xy.x - this.state.rect.x, 
                y: e.xy.y - this.state.rect.y 
            }; 

            this.state.altKey = e.altKey
            
            this.bindData('$view');
        } else {
            // this.state.altKey = false; 
        }

    }

    [POINTERSTART('$view :not(.split-path)') + MOVE() + END()] (e) {

        // console.log(e);

        this.state.rect = this.parent.refs.$body.rect();            
        this.state.canvasOffset = this.refs.$view.rect();
        this.state.altKey = false; 

        this.state.dragXY = {
            x: e.xy.x - this.state.rect.x, 
            y: e.xy.y - this.state.rect.y
        }; 

        this.$el.focus()

        this.state.$target = Dom.create(e.target);
        this.state.isSegment = this.state.$target.attr('data-segment') === 'true';

        if (this.state.isSegment) {

            this.changeMode('segment-move');
            var index = +this.state.$target.attr('data-index')
            this.polygonGenerator.setCachePoint(index);

        } else if (this.isMode('star')) {
            this.polygonGenerator.moveStart()

        } else if (this.isMode('draw')) {
            // this.changeMode('draw');   
        } else {

        }

    }

    move (dx, dy) {

        if (this.isMode('star')) {

            this.polygonGenerator.moveStar(dx, dy, editor.config.get('bodyEvent'));

            this.bindData('$view');            

        } else if (this.isMode('segment-move')) {

            this.polygonGenerator.move(dx, dy, editor.config.get('bodyEvent'));

            this.bindData('$view');            

            this.updatePolygonLayer();

        } else if (this.isMode('draw')) {
            // var e = editor.config.get('bodyEvent');

            // this.state.dragPoints = e.altKey ? false : true; 
        } else if (this.isMode('move')) {
            
        }

    }

    end (dx, dy) {

        if (this.state.$target.is(this.refs.$view) && editor.config.get('bodyEvent').altKey)  {
            // 에디팅  종료 
            this.trigger('hidePolygonEditor')
            this.changeMode('modify');            
            return ; 
        }

        if (this.isMode('segment-move')) {
            this.changeMode('modify');
        } else if (this.isMode('star')) {

            this.polygonGenerator.moveEndStar(dx, dy);

            this.bindData('$view');
        } else if (this.isMode('draw')) {            


            this.polygonGenerator.moveEnd(dx, dy);

            this.bindData('$view');

        }

    }   

} 