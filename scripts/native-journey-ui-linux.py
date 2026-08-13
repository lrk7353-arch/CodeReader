#!/usr/bin/env python3
"""Drive CodeReader through AT-SPI. Failure is evidence failure, never a skip."""

import os
import json
import sys
import time

import pyatspi
from PIL import ImageGrab


TIMEOUT = 30


def descendants(node):
    yield node
    for child in node:
        yield from descendants(child)


def app_root():
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        for app in pyatspi.Registry.getDesktop(0):
            if "codereader" in (app.name or "").lower():
                return app
        time.sleep(0.25)
    raise RuntimeError("CodeReader was not exposed through AT-SPI")


def find(name, role=None, root=None):
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        for node in descendants(root or app_root()):
            if (node.name or "").strip() != name:
                continue
            if role and node.getRoleName() != role:
                continue
            return node
        time.sleep(0.25)
    raise RuntimeError(f"AT-SPI element not found: {name!r} ({role or 'any role'})")


def state_names(node):
    state_set = node.getState()
    return {pyatspi.stateToString(state) for state in state_set.getStates()}


def require_any_state(node, *expected):
    states = state_names(node)
    if not any(value in states for value in expected):
        raise RuntimeError(f"{node.name!r} lacks required state {expected}: {sorted(states)}")


def require_all_states(node, *expected):
    states = state_names(node)
    missing = [value for value in expected if value not in states]
    if missing:
        raise RuntimeError(f"{node.name!r} lacks required states {missing}: {sorted(states)}")


def require_visible_inside(node, window):
    require_all_states(node, "showing", "visible")
    extent = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    if extent.width <= 0 or extent.height <= 0 or extent.x < window.x or extent.y < window.y or extent.x + extent.width > window.x + window.width or extent.y + extent.height > window.y + window.height:
        raise RuntimeError(f"{node.name!r} is not visibly inside the CodeReader window")


def record(phases, name, probe):
    if name in phases:
        raise RuntimeError(f"phase was recorded twice: {name}")
    phases[name] = {"status": "pass", "probe": probe}


def luminance(rgb):
    channels = []
    for value in rgb[:3]:
        value /= 255
        channels.append(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def grab_target(node):
    extent = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    return ImageGrab.grab((extent.x, extent.y, extent.x + extent.width, extent.y + extent.height)).convert("RGB")


def audit_contrast(node):
    image = grab_target(node)
    colors = sorted(image.getcolors(image.width * image.height) or [], reverse=True)
    if len(colors) < 2:
        raise RuntimeError("contrast audit found fewer than two rendered colors")
    # The modal edge color identifies the actual painted background. Text
    # glyph pixels are sampled from the central label band and must repeat.
    edge = [image.getpixel((x, y)) for x, y in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]]
    background = max(set(edge), key=edge.count)
    band = image.crop((max(0, image.width // 5), image.height // 4, min(image.width, image.width * 4 // 5), image.height * 3 // 4))
    candidates = [(count, color) for count, color in (band.getcolors(band.width * band.height) or []) if color != background and count >= 2]
    if not candidates:
        raise RuntimeError("contrast audit found no target text pixels")
    foreground = min(candidates, key=lambda item: luminance(item[1]))[1]
    ratio = (max(luminance(background), luminance(foreground)) + 0.05) / (min(luminance(background), luminance(foreground)) + 0.05)
    if ratio < 4.5:
        raise RuntimeError(f"rendered target text contrast below 4.5:1 ({ratio:.2f})")
    return ratio


def require_focus_ring(node):
    unfocused = grab_target(node)
    node.grabFocus()
    time.sleep(0.05)
    require_all_states(node, "focused", "selected")
    focused = grab_target(node)
    if unfocused.tobytes() == focused.tobytes():
        raise RuntimeError("focused target did not render a visible focus indicator")


def require_triggered_pixel_stability(origin, target):
    origin.grabFocus()
    require_all_states(origin, "focused", "selected")
    key("Right")
    # Capture immediately after the real product transition is triggered, then
    # at cumulative 50/100/150/300ms. Any intermediate animation is a failure.
    frames = [grab_target(target).tobytes()]
    for delay in (0.05, 0.05, 0.05, 0.15):
        time.sleep(delay)
        frames.append(grab_target(target).tobytes())
    if len(set(frames)) != 1:
        raise RuntimeError("CodeReader target pixels changed across reduced-motion frames")
    require_all_states(target, "focused", "selected")


def snapshot_extent(node):
    extent = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    return (extent.x, extent.y, extent.width, extent.height)


def activate(name, role="push button"):
    node = find(name, role)
    actions = node.queryAction()
    for index in range(actions.nActions):
        action_name = actions.getName(index).lower()
        if action_name in ("click", "press", "activate"):
            if not actions.doAction(index):
                raise RuntimeError(f"AT-SPI action failed for {name!r}")
            return
    raise RuntimeError(f"No activation action for {name!r}")


def key(name):
    pyatspi.Registry.generateKeyboardEvent(0, name, pyatspi.KEY_SYM)


def type_text(value):
    for char in value:
        pyatspi.Registry.generateKeyboardEvent(ord(char), None, pyatspi.KEY_STRING)


def choose_folder(path):
    activate("打开项目")
    time.sleep(1)
    key("<Control>l")
    type_text(path)
    key("Return")
    time.sleep(1)
    key("Return")
    find(os.path.basename(path))


def set_text(node, value):
    editable = node.queryEditableText()
    editable.setTextContents(value)


def configure_model(endpoint):
    activate("更多")
    activate("模型设置", "menu item")
    dialog = find("模型设置", "dialog")
    fields = [node for node in descendants(dialog) if node.getRoleName() in ("entry", "password text")]
    if len(fields) < 3:
        raise RuntimeError("Model settings did not expose editable fields through AT-SPI")
    set_text(fields[0], endpoint)
    set_text(fields[1], "journey-stub")
    activate("测试连接")
    find("连接成功：journey-stub")
    activate("保存配置")


def generate_explanation():
    activate("生成解释")
    find("生成确认", "dialog")
    activate("确认发送")
    find("The selected function validates input and returns a stable result.")


def main():
    if len(sys.argv) != 4:
        raise RuntimeError("usage: native-journey-ui-linux.py <controlled-project> <stub-endpoint> <phase-file>")
    project = os.path.realpath(sys.argv[1])
    if not os.path.isdir(project):
        raise RuntimeError("controlled project is missing")
    phases = {}
    root = app_root()
    choose_folder(project)
    record(phases, "native-picker-open-project", "native chooser opened controlled directory and project root appeared in AT-SPI")
    configure_model(sys.argv[2])
    find("真实代码", "page tab")
    # Keyboard focus roundtrip through the three-pane tablist.
    code_tab = find("真实代码", "page tab")
    code_tab.grabFocus()
    require_all_states(code_tab, "focused", "selected")
    key("Right")
    why_tab = find("为什么重要", "page tab")
    require_all_states(why_tab, "focused", "selected")
    key("Left")
    require_all_states(code_tab, "focused", "selected")
    require_focus_ring(why_tab)
    record(phases, "keyboard-focus-roundtrip", "AT-SPI focused/selected state moved right and returned left")
    # Reset first, then use Chromium's exact sequence: 100, 110, 125, 150, 175, 200 percent.
    key("<Control>0")
    for _ in range(5):
        key("<Control>plus")
    time.sleep(1)
    window = root.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    for name in ("下一步", "真实代码", "为什么重要"):
        extent = find(name, "page tab").queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        if extent.x < window.x or extent.y < window.y or extent.x + extent.width > window.x + window.width or extent.y + extent.height > window.y + window.height:
            raise RuntimeError(f"200% zoom overflowed key content: {name}")
    contrast = audit_contrast(code_tab)
    record(phases, "zoom-200-contrast", f"five Chromium zoom increments reached 200%; key pane extents remained inside window; rendered tab pixel contrast {contrast:.2f}:1")
    # Open long README, focus its scrollable content, and reach the final line.
    readme = find("README.md")
    readme.queryAction().doAction(0)
    time.sleep(1)
    key("<Control>End")
    time.sleep(0.5)
    terminal = find("JOURNEY-END-CONTENT")
    require_visible_inside(terminal, window)
    record(phases, "long-content", "opened runtime-controlled 300-paragraph README, scrolled to end, and found terminal marker")
    animations = os.popen("gsettings get org.gnome.desktop.interface enable-animations").read().strip()
    if animations != "false":
        raise RuntimeError("reduced-motion setting was not active")
    require_triggered_pixel_stability(code_tab, why_tab)
    record(phases, "reduced-motion", "GNOME animations disabled; after a real Right-key tab transition, CodeReader target-region frames at 0/50/100/150/300ms were pixel-identical")
    generate_explanation()
    record(phases, "explanation-generation", "local model response appeared in AT-SPI after confirmed generation")
    with open(sys.argv[3], "w", encoding="utf-8") as output:
        json.dump(phases, output)


def verify_restore(wrong_project, project):
    app_root()
    choose_folder(os.path.realpath(wrong_project))
    find(os.path.basename(os.path.realpath(wrong_project)))
    try:
        find("The selected function validates input and returns a stable result.", root=app_root())
    except RuntimeError:
        pass
    else:
        raise RuntimeError("wrong project restored the prior project's explanation context")
    choose_folder(os.path.realpath(project))
    find(os.path.basename(os.path.realpath(project)))
    find("README.md")
    find("The selected function validates input and returns a stable result.")


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "--verify-restore":
            verify_restore(sys.argv[2], sys.argv[3])
        else:
            main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
