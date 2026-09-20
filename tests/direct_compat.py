"""genlayer-test 0.30.0rc2 transport compatibility for the pinned Next runner.

Infrastructure shim only: no review output, gate result, or storage is mocked here.
"""
import os
import sys
import tempfile
import json


def install():
    from gltest.direct import loader
    from gltest.direct import wasi_mock
    from gltest.direct.vm import VMContext
    if getattr(loader, "_chartergate_compat", False):
        return
    # The pinned v0.3 runner decodes JSON *text* from the WASI envelope. The
    # test SDK still auto-parses mock JSON into a dict (the old wire format).
    # Serialize that envelope value back; preserve errors and malformed text.
    # No contract parser, validator, gate, or state-write behavior is replaced.
    original_llm = wasi_mock._handle_llm_request
    def llm_json_text(vm, data):
        response = original_llm(vm, data)
        if isinstance(response, dict) and "ok" in response and not isinstance(response["ok"], str):
            return {**response, "ok": json.dumps(response["ok"], ensure_ascii=False)}
        return response
    wasi_mock._handle_llm_request = llm_json_text
    # The pinned SDK exposes message.raw, but gltest's refresh only updates
    # typed caller/value fields. Keep the simulated transaction timestamp in
    # that raw envelope in sync with warp(); never replace contract time logic.
    original_refresh = VMContext._refresh_gl_message
    def refresh(vm):
        original_refresh(vm)
        sdk = sys.modules.get("genlayer")
        message = getattr(sdk, "message", None)
        raw = getattr(message, "raw", None)
        if isinstance(raw, dict):
            raw["datetime"] = vm._datetime
    VMContext._refresh_gl_message = refresh
    if sys.platform == "win32":
        def inject(vm):
            from genlayer import calldata
            from genlayer.types import Address
            address = lambda x: Address(x) if isinstance(x, bytes) else x
            encoded = calldata.encode({"contract_address": address(vm._contract_address),
                "sender_address": address(vm.sender), "origin_address": address(vm.origin),
                "stack": [], "value": vm._value, "datetime": vm._datetime,
                "is_init": False, "chain_id": vm._chain_id, "entry_kind": 0,
                "entry_data": b"", "entry_stage_data": None})
            fd, path = tempfile.mkstemp()
            try:
                os.write(fd, encoded)
                os.lseek(fd, 0, os.SEEK_SET)
                vm._original_stdin_fd = os.dup(0)
                os.dup2(fd, 0)
                vm._chartergate_stdin_path = path
            finally:
                os.close(fd)
        original_cleanup = VMContext._cleanup_after_deactivate
        def cleanup(vm):
            path = getattr(vm, "_chartergate_stdin_path", None)
            try:
                original_cleanup(vm)
            finally:
                if path:
                    try:
                        os.unlink(path)
                    except FileNotFoundError:
                        pass
                    vm._chartergate_stdin_path = None
        loader._inject_message_to_fd0 = inject
        VMContext._cleanup_after_deactivate = cleanup
    loader._chartergate_compat = True
