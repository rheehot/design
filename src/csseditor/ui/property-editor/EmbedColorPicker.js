import UIElement from "../../../util/UIElement";
import ColorPickerUI from "../../../colorpicker/index";

export default class EmbedColorPicker extends UIElement {
  afterRender() {

    var defaultColor = "rgba(0, 0, 0, 1)";

    this.colorPicker = ColorPickerUI.create({
      $editor: this.$editor,
      type: 'sketch',
      position: "inline",
      container: this.refs.$color.el,
      color: this.props.value || defaultColor,
      onChange: c => {
        this.changeColor(c);
      }

    });
  }

  initState() {
    return {
      color: 'rgba(0, 0, 0, 1)'
    }
  }

  template() {
    return /*html*/`
      <div ref="$color"></div>
    `;
  }

  changeColor(color) {
    this.parent.trigger(this.props.onchange, color);
  }

  setValue (color) {
    this.colorPicker.initColorWithoutChangeEvent(color);
  }

  refresh() {
    this.colorPicker.initColorWithoutChangeEvent(this.state.color);
  }

}
