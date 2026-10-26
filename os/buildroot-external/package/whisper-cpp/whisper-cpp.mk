################################################################################
#
# whisper-cpp — STT local de NomikOS (micrófono → texto en la placa)
#
# whisper.cpp v1.9.5: CMake, sin BLAS ni SDL2; el binario whisper-cli
# alimenta el bucle de voz (/usr/bin/voice-loop.sh). Tests OFF porque
# hacen FetchContent de googletest (red) y no se necesitan.
#
################################################################################

WHISPER_CPP_VERSION = v1.9.5
WHISPER_CPP_SITE = https://github.com/ggml-org/whisper.cpp
WHISPER_CPP_SITE_METHOD = git
WHISPER_CPP_LICENSE = MIT
WHISPER_CPP_LICENSE_FILES = LICENSE
WHISPER_CPP_CONF_OPTS = \
	-DWHISPER_BUILD_TESTS=OFF \
	-DWHISPER_BUILD_EXAMPLES=ON \
	-DWHISPER_SDL2=OFF \
	-DGGML_BLAS=OFF \
	-DGGML_OPENMP=OFF

define WHISPER_CPP_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/bin/whisper-cli \
		$(TARGET_DIR)/usr/bin/whisper-cli
endef

$(eval $(cmake-package))
