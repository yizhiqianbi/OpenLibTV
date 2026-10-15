# Studio 第三方许可

| 来源                                      | 使用范围                                        | 本地许可                                            |
| ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Three 0.186.1                             | GLTFLoader / GLTFExporter / mixer / DRACOLoader | Three-MIT.txt（安装包 LICENSE 副本）                |
| Google Draco，随 Three 0.186.1 分发       | JS / wasm decoder                               | Draco-APACHE-2.0.txt（Google 官方 LICENSE）         |
| zeux/meshoptimizer，随 Three 0.186.1 分发 | MeshoptDecoder，代表性解码测试字节              | Meshoptimizer-MIT.txt（官方 LICENSE.md）            |
| react-colorful 5.8.1                      | Studio 颜色选择器 HEX/RGB 色盘                  | react-colorful-MIT.txt（npm 包 LICENSE 副本）       |
| Cesium / Khronos glTF-Sample-Models Box   | fixtures/draco-box.glb，仅测试/QA               | Box-CC-BY-4.0.txt（SPDX 保存的完整 CC BY 4.0 文本） |

Box 源模型由 [Cesium](https://cesium.com/) 捐赠用于 glTF 测试，来源 [Khronos Box](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/Box)。本地修改仅为将 Box.bin 合并到 GLB 容器；几何未改。许可 [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)。

Draco 许可来源：[Google Draco LICENSE](https://github.com/google/draco/blob/master/LICENSE)。Meshoptimizer 许可及测试来源：[meshoptimizer](https://github.com/zeux/meshoptimizer)。这些是开源 decoder，不是运行原站脚本；原站 bundle 始终只用于源码研究。
