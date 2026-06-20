def test_function():
    acq = None
    try:
        pass  # main processing
    except Exception as e:
        pass  # main except
    finally:  # main finally
        if acq:
            try:
                if hasattr(acq, 'send_command'):
                    pass  # send command
            except Exception as e:
                pass  # handle send command error
        
        if acq is not None:
            try:
                pass  # acq.stop()
            except Exception:
                pass  # handle stop error

@some_decorator
def other_function():
    pass