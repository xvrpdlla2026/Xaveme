<?php

namespace App\Http\Requests\Vault;

use App\Http\Requests\ApiRequest;

class StoreVaultRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'salt' => ['required', 'string', 'max:255', $this->base64()],
            'iterations' => ['required', 'integer', 'min:10000', 'max:2000000'],
            'check_iv' => ['required', 'string', 'max:255', $this->base64()],
            'check_ct' => ['required', 'string', 'max:1024', $this->base64()],
        ];
    }

    /**
     * The vault fields are opaque to the server, but they still have to be
     * well formed base64 before they are stored.
     */
    private function base64(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if (! is_string($value) || $value === '') {
                $fail('The '.$attribute.' field must be a base64 encoded string.');

                return;
            }

            $decoded = base64_decode(strtr($value, '-_', '+/'), true);

            if ($decoded === false || base64_encode($decoded) !== strtr($value, '-_', '+/')) {
                $fail('The '.$attribute.' field must be a base64 encoded string.');
            }
        };
    }
}