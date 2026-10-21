import QtQuick
import Quickshell
import "tests/qml"

ShellRoot {
  // QtTest TestCase runs without a visible window; Quickshell supplies Io.
  property var tests: TestCaseHost { }
}
